import { ChatView } from "@/components/chat/chat-view";

// The session id comes from the URL inside ChatView: the stream can create a session and update the URL without a remount.
export default function Page() {
  return <ChatView />;
}
