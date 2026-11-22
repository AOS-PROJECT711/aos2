export function canManageShare(ownerId: string | null | undefined, userId: string) {
  return ownerId !== null && ownerId !== undefined && ownerId === userId;
}