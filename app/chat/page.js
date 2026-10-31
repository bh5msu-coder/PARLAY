import { Suspense } from 'react';
import ChatView from '../../components/ChatView';

export default function ChatPage() {
  // ChatView reads ?a=&b= with useSearchParams, which needs a Suspense boundary.
  return <Suspense fallback={null}><ChatView /></Suspense>;
}
