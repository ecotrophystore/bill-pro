import { useAuth } from '../contexts/AuthContext';
import { CRM_ROLE_PERMISSIONS, type CRMPermissionAction } from '../types';

export function useCRMPermission() {
  const { dbUser } = useAuth();

  const hasPermission = (action: CRMPermissionAction): boolean => {
    if (!dbUser) return false;
    const permissions = CRM_ROLE_PERMISSIONS[dbUser.role] || [];
    return permissions.includes(action);
  };

  return {
    hasPermission,
    role: dbUser?.role || null,
  };
}
