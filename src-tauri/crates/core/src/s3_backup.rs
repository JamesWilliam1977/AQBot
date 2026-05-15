use aws_config::BehaviorVersion;
use aws_credential_types::{provider::SharedCredentialsProvider, Credentials};
use aws_sdk_s3::config::Region;
use aws_sdk_s3::primitives::{ByteStream, DateTime, DateTimeFormat};
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};
use std::path::Path;

use crate::error::{AQBotError, Result};
use crate::webdav::parse_hostname_from_filename;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub prefix: String,
    pub endpoint_url: Option<String>,
    pub force_path_style: bool,
    pub use_default_credentials: bool,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct S3FileInfo {
    pub file_name: String,
    pub size: i64,
    pub last_modified: String,
    pub hostname: String,
}

pub struct S3BackupClient {
    client: Client,
    config: S3Config,
}

impl S3BackupClient {
    pub async fn new(config: S3Config) -> Result<Self> {
        validate_config(&config)?;

        let mut loader = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(config.region.trim().to_string()));

        if !config.use_default_credentials {
            let session_token = config
                .session_token
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(ToOwned::to_owned);
            let credentials = Credentials::new(
                config.access_key_id.trim(),
                config.secret_access_key.trim(),
                session_token,
                None,
                "aqbot-s3",
            );
            loader = loader.credentials_provider(SharedCredentialsProvider::new(credentials));
        }

        let shared_config = loader.load().await;
        let mut s3_config = aws_sdk_s3::config::Builder::from(&shared_config)
            .force_path_style(config.force_path_style);

        if let Some(endpoint) = normalized_endpoint(&config) {
            s3_config = s3_config.endpoint_url(endpoint);
        }

        Ok(Self {
            client: Client::from_conf(s3_config.build()),
            config,
        })
    }

    pub async fn check_connection(&self) -> Result<bool> {
        self.client
            .head_bucket()
            .bucket(bucket_name(&self.config))
            .send()
            .await
            .map_err(|e| AQBotError::Gateway(format!("S3 connection failed: {}", e)))?;
        Ok(true)
    }

    pub async fn list_files(&self) -> Result<Vec<S3FileInfo>> {
        let mut files = Vec::new();
        let mut continuation_token = None;
        let prefix = normalize_prefix(&self.config.prefix);

        loop {
            let mut request = self
                .client
                .list_objects_v2()
                .bucket(bucket_name(&self.config))
                .prefix(&prefix);

            if let Some(token) = continuation_token {
                request = request.continuation_token(token);
            }

            let response = request
                .send()
                .await
                .map_err(|e| AQBotError::Gateway(format!("S3 list backups failed: {}", e)))?;

            for object in response.contents() {
                let Some(key) = object.key() else {
                    continue;
                };
                let Some(file_name) = backup_file_name_from_key(&prefix, key) else {
                    continue;
                };
                files.push(S3FileInfo {
                    file_name: file_name.clone(),
                    size: object.size().unwrap_or(0),
                    last_modified: object
                        .last_modified()
                        .map(format_last_modified)
                        .unwrap_or_default(),
                    hostname: parse_hostname_from_filename(&file_name),
                });
            }

            if !response.is_truncated().unwrap_or(false) {
                break;
            }
            continuation_token = response
                .next_continuation_token()
                .map(ToOwned::to_owned);
            if continuation_token.is_none() {
                break;
            }
        }

        sort_backup_files(&mut files);
        Ok(files)
    }

    pub async fn upload_file(&self, filename: &str, local_path: &Path) -> Result<()> {
        let body = ByteStream::from_path(local_path)
            .await
            .map_err(|e| AQBotError::Gateway(format!("Failed to read file for S3 upload: {}", e)))?;
        self.client
            .put_object()
            .bucket(bucket_name(&self.config))
            .key(object_key(&self.config.prefix, filename))
            .body(body)
            .send()
            .await
            .map_err(|e| AQBotError::Gateway(format!("S3 upload failed: {}", e)))?;
        Ok(())
    }

    pub async fn download_file(&self, filename: &str, local_path: &Path) -> Result<()> {
        let response = self
            .client
            .get_object()
            .bucket(bucket_name(&self.config))
            .key(object_key(&self.config.prefix, filename))
            .send()
            .await
            .map_err(|e| AQBotError::Gateway(format!("S3 download failed: {}", e)))?;
        let data = response
            .body
            .collect()
            .await
            .map_err(|e| AQBotError::Gateway(format!("Failed to read S3 download: {}", e)))?
            .into_bytes();
        std::fs::write(local_path, &data)
            .map_err(|e| AQBotError::Gateway(format!("Failed to write download: {}", e)))?;
        Ok(())
    }

    pub async fn delete_file(&self, filename: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(bucket_name(&self.config))
            .key(object_key(&self.config.prefix, filename))
            .send()
            .await
            .map_err(|e| AQBotError::Gateway(format!("S3 delete failed: {}", e)))?;
        Ok(())
    }
}

fn validate_config(config: &S3Config) -> Result<()> {
    if config.bucket.trim().is_empty() {
        return Err(AQBotError::Gateway("S3 bucket is required".into()));
    }
    if config.region.trim().is_empty() {
        return Err(AQBotError::Gateway("S3 region is required".into()));
    }
    if !config.use_default_credentials {
        if config.access_key_id.trim().is_empty() {
            return Err(AQBotError::Gateway("S3 access key ID is required".into()));
        }
        if config.secret_access_key.trim().is_empty() {
            return Err(AQBotError::Gateway(
                "S3 secret access key is required".into(),
            ));
        }
    }
    Ok(())
}

fn bucket_name(config: &S3Config) -> &str {
    config.bucket.trim()
}

fn normalized_endpoint(config: &S3Config) -> Option<String> {
    config
        .endpoint_url
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn normalize_prefix(prefix: &str) -> String {
    let trimmed = prefix.trim().trim_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{}/", trimmed)
    }
}

pub(crate) fn object_key(prefix: &str, filename: &str) -> String {
    format!("{}{}", normalize_prefix(prefix), filename.trim_start_matches('/'))
}

pub(crate) fn backup_file_name_from_key(prefix: &str, key: &str) -> Option<String> {
    let name = key.strip_prefix(prefix).unwrap_or(key);
    if name.contains('/') || !name.starts_with("aqbot-backup-") || !name.ends_with(".zip") {
        return None;
    }
    Some(name.to_string())
}

pub(crate) fn sort_backup_files(files: &mut [S3FileInfo]) {
    files.sort_by(|a, b| b.file_name.cmp(&a.file_name));
}

fn format_last_modified(value: &DateTime) -> String {
    value
        .fmt(DateTimeFormat::DateTime)
        .unwrap_or_else(|_| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_s3_prefix_for_object_keys() {
        assert_eq!(normalize_prefix(""), "");
        assert_eq!(normalize_prefix("/aqbot/backups/"), "aqbot/backups/");
        assert_eq!(object_key("/aqbot/backups/", "/backup.zip"), "aqbot/backups/backup.zip");
    }

    #[test]
    fn filters_backup_files_from_prefixed_keys() {
        let prefix = normalize_prefix("aqbot/backups");

        assert_eq!(
            backup_file_name_from_key(&prefix, "aqbot/backups/aqbot-backup-20260515_010203.host.zip"),
            Some("aqbot-backup-20260515_010203.host.zip".to_string())
        );
        assert_eq!(
            backup_file_name_from_key(&prefix, "aqbot/backups/nested/aqbot-backup-20260515_010203.host.zip"),
            None
        );
        assert_eq!(
            backup_file_name_from_key(&prefix, "aqbot/backups/not-a-backup.zip"),
            None
        );
        assert_eq!(
            backup_file_name_from_key(&prefix, "aqbot/backups/aqbot-backup-20260515_010203.host.db"),
            None
        );
    }

    #[test]
    fn sorts_s3_backups_newest_first_by_filename() {
        let mut files = vec![
            S3FileInfo {
                file_name: "aqbot-backup-20260514_010203.alpha.zip".to_string(),
                size: 1,
                last_modified: String::new(),
                hostname: "alpha".to_string(),
            },
            S3FileInfo {
                file_name: "aqbot-backup-20260515_010203.alpha.zip".to_string(),
                size: 1,
                last_modified: String::new(),
                hostname: "alpha".to_string(),
            },
        ];

        sort_backup_files(&mut files);

        assert_eq!(files[0].file_name, "aqbot-backup-20260515_010203.alpha.zip");
        assert_eq!(files[1].file_name, "aqbot-backup-20260514_010203.alpha.zip");
    }

    #[tokio::test]
    async fn explicit_credentials_require_access_key_and_secret() {
        let config = S3Config {
            bucket: "bucket".to_string(),
            region: "us-east-1".to_string(),
            use_default_credentials: false,
            ..Default::default()
        };

        let err = match S3BackupClient::new(config).await {
            Ok(_) => panic!("config without explicit credentials should fail"),
            Err(err) => err.to_string(),
        };

        assert!(err.contains("S3 access key ID is required"));
    }

    #[tokio::test]
    async fn default_credentials_still_require_bucket_and_region() {
        let config = S3Config {
            use_default_credentials: true,
            ..Default::default()
        };

        let err = match S3BackupClient::new(config).await {
            Ok(_) => panic!("config without bucket should fail"),
            Err(err) => err.to_string(),
        };

        assert!(err.contains("S3 bucket is required"));
    }
}
