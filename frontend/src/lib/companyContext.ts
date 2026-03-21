export function getActiveCompanyId(): string | null {
  return sessionStorage.getItem('activeCompanyId');
}

export function setActiveCompanyId(id: string): void {
  sessionStorage.setItem('activeCompanyId', id);
  window.dispatchEvent(new CustomEvent('activeCompanyChanged'));
}

export function clearActiveCompanyId(): void {
  sessionStorage.removeItem('activeCompanyId');
}

export function getActiveClientId(): string | null {
  return sessionStorage.getItem('activeClientId');
}

export function setActiveClientId(id: string): void {
  sessionStorage.setItem('activeClientId', id);
}
