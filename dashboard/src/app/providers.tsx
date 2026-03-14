"use client";

export function Providers({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  // Auth is handled by SWA (staticwebapp.config.json enforces AAD login).
  // No client-side MSAL needed — SWA passes x-ms-client-principal to the API.
  return <>{children}</>;
}
