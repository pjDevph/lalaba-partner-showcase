// app/index.tsx
// Placeholder initial route — _layout.tsx's routing effect owns every auth
// decision (including unauthenticated → /login) and replaces this screen the
// moment it's ready. This must NOT redirect on its own: index.tsx mounts as a
// child of _layout.tsx's <Stack>, so its effects commit before _layout.tsx's
// routing effect does. A hardcoded <Redirect href="/login"> here could win
// that race and land after the real routing decision, stranding an already
// authenticated user on the login screen.
export default function Index() {
  return null;
}
