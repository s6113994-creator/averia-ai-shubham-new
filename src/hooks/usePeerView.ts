// Deprecated: read-only peer guest pattern removed. Both members of a joint
// workspace are full participants of the shared scope.
export interface PeerView { isPeerView: false; workspaceId: null; targetUserId: null; readonly: false }
export function usePeerView(): PeerView {
  return { isPeerView: false, workspaceId: null, targetUserId: null, readonly: false };
}
