import { create } from 'zustand';
import { invoke } from '@/lib/invoke';
import type { CreateRoleInput, MarketplaceRole, Role, RoleMarketplaceSource, UpdateRoleInput } from '@/types';

const DEFAULT_MARKETPLACE_SOURCE = 'prompts-chat';
let marketplaceSearchSeq = 0;

interface RoleState {
  roles: Role[];
  marketplaceRoles: MarketplaceRole[];
  marketplaceSources: RoleMarketplaceSource[];
  selectedMarketplaceSource: string;
  loading: boolean;
  marketplaceLoading: boolean;
  loadRoles: () => Promise<void>;
  loadMarketplaceSources: () => Promise<void>;
  setMarketplaceSource: (sourceId: string) => void;
  createRole: (input: CreateRoleInput) => Promise<Role>;
  updateRole: (id: string, input: UpdateRoleInput) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;
  searchMarketplace: (query: string) => Promise<void>;
  installRole: (sourceKind: string, sourceRef: string) => Promise<Role>;
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: [],
  marketplaceRoles: [],
  marketplaceSources: [],
  selectedMarketplaceSource: DEFAULT_MARKETPLACE_SOURCE,
  loading: false,
  marketplaceLoading: false,

  loadRoles: async () => {
    set({ loading: true });
    try {
      const roles = await invoke<Role[]>('list_roles');
      set({ roles, loading: false });
    } catch (e) {
      console.error('[roleStore] loadRoles failed:', e);
      set({ loading: false });
    }
  },

  loadMarketplaceSources: async () => {
    try {
      const marketplaceSources = await invoke<RoleMarketplaceSource[]>('list_role_marketplace_sources');
      const selectedMarketplaceSource =
        marketplaceSources.find((source) => source.default)?.id
        ?? marketplaceSources[0]?.id
        ?? DEFAULT_MARKETPLACE_SOURCE;
      set({ marketplaceSources, selectedMarketplaceSource });
    } catch (e) {
      console.error('[roleStore] loadMarketplaceSources failed:', e);
    }
  },

  setMarketplaceSource: (selectedMarketplaceSource) => set({ selectedMarketplaceSource }),

  createRole: async (input) => {
    const role = await invoke<Role>('create_role', { input });
    set((s) => ({ roles: [role, ...s.roles] }));
    return role;
  },

  updateRole: async (id, input) => {
    const role = await invoke<Role>('update_role', { id, input });
    set((s) => ({ roles: s.roles.map((item) => (item.id === id ? role : item)) }));
    return role;
  },

  deleteRole: async (id) => {
    await invoke('delete_role', { id });
    set((s) => ({ roles: s.roles.filter((role) => role.id !== id) }));
  },

  searchMarketplace: async (query) => {
    const seq = ++marketplaceSearchSeq;
    set({ marketplaceLoading: true, marketplaceRoles: [] });
    try {
      const marketplaceRoles = await invoke<MarketplaceRole[]>('search_role_marketplace', {
        sourceId: get().selectedMarketplaceSource,
        query,
      });
      if (seq === marketplaceSearchSeq) {
        set({ marketplaceRoles, marketplaceLoading: false });
      }
    } catch (e) {
      console.error('[roleStore] searchMarketplace failed:', e);
      if (seq === marketplaceSearchSeq) {
        set({ marketplaceLoading: false });
      }
    }
  },

  installRole: async (sourceKind, sourceRef) => {
    const role = await invoke<Role>('install_role', { sourceKind, sourceRef });
    set({
      roles: [role, ...get().roles],
      marketplaceRoles: get().marketplaceRoles.map((item) =>
        item.source_ref === sourceRef ? { ...item, installed: true } : item,
      ),
    });
    return role;
  },
}));
