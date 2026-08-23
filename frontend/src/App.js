import AppShell from "./AppShell";
import { NotificationProvider } from "./lib/notifications";
import { ProtocolProvider } from "./hooks/useProtocol";

/**
 * Provider order matters:
 *
 *  NotificationProvider  — owns toasts + the activity feed
 *    ProtocolProvider    — owns the single copy of chain state, and pushes
 *                          notifications as transactions progress
 *      AppShell          — routes and pages, all reading the same store
 */
function App() {
  return (
    <NotificationProvider>
      <ProtocolProvider>
        <AppShell />
      </ProtocolProvider>
    </NotificationProvider>
  );
}

export default App;
