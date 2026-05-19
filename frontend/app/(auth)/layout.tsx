/**
 * Auth route group layout — forces light theme regardless of the user's
 * global preference. The auth pages have a deliberate cream-and-green
 * marketing aesthetic (floating archive cards, hero typography, warm
 * paper) that doesn't translate to a dark variant. We override the
 * inherited [data-theme] on a wrapper so all CSS variables resolve to
 * their light values within this subtree.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div data-theme="light">{children}</div>;
}
