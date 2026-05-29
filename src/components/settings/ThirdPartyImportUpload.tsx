import { useEffect, useState, type KeyboardEvent } from 'react';
import { Spin, Typography, Upload, theme } from 'antd';
import { FileArchive, UploadCloud } from 'lucide-react';

const { Text } = Typography;

type Props = {
  active: boolean;
  accept: string;
  exportPath: string;
  loading: boolean;
  path: string | null;
  supportedFormats: string;
  uploadHint: string;
  onPickFile: () => void | Promise<void>;
  onPathSelected: (path: string) => void | Promise<void>;
};

type DroppedFile = File & { path?: string };

export function ThirdPartyImportUpload({
  active,
  accept,
  exportPath,
  loading,
  path,
  supportedFormats,
  uploadHint,
  onPickFile,
  onPathSelected,
}: Props) {
  const { token } = theme.useToken();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview');
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (cancelled) return;

          if (event.payload.type === 'enter') {
            setDragging(true);
          } else if (event.payload.type === 'leave') {
            setDragging(false);
          } else if (event.payload.type === 'drop') {
            setDragging(false);
            const [firstPath] = event.payload.paths;
            if (firstPath) {
              void onPathSelected(firstPath);
            }
          }
        });
      } catch {
        // Browser tests and non-Tauri previews do not expose webview drag paths.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [active, onPathSelected]);

  const handlePickFile = () => {
    if (loading) return;
    void onPickFile();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handlePickFile();
    }
  };

  return (
    <div>
      <Spin spinning={loading}>
        <div
          role="button"
          tabIndex={0}
          aria-label={uploadHint}
          onClick={handlePickFile}
          onKeyDown={handleKeyDown}
          style={{ cursor: loading ? 'default' : 'pointer' }}
        >
          <Upload.Dragger
            accept={accept}
            beforeUpload={() => false}
            disabled={loading}
            maxCount={1}
            multiple={false}
            openFileDialogOnClick={false}
            showUploadList={false}
            onDrop={(event) => {
              const [file] = Array.from(event.dataTransfer.files) as DroppedFile[];
              if (file?.path) {
                void onPathSelected(file.path);
              }
            }}
            style={{
              background: dragging ? token.colorPrimaryBg : token.colorFillAlter,
              borderColor: dragging ? token.colorPrimary : token.colorBorderSecondary,
              borderRadius: 8,
            }}
          >
            <div className="flex flex-col items-center gap-2 px-4 py-5 text-center">
              <UploadCloud size={28} style={{ color: token.colorPrimary }} />
              <Text strong>{uploadHint}</Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {supportedFormats}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {exportPath}
              </Text>
            </div>
          </Upload.Dragger>
        </div>
      </Spin>

      {path && (
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
          <FileArchive size={13} style={{ marginRight: 6, verticalAlign: -2 }} />
          {path}
        </Text>
      )}
    </div>
  );
}
