import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onMessage } from 'firebase/messaging';
import { messaging } from '../lib/firebase';
import toast from 'react-hot-toast';

export default function PushManager() {
  const navigate = useNavigate();

  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    if (messaging) {
      const unsubscribe = onMessage(messaging, (payload) => {
        if (!payload?.data) return;

        const { senderName, conversationId } = payload.data;

        toast.custom((t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              if (conversationId) {
                navigate(`/chat/${conversationId}`);
              }
            }}
            className={`${
              t.visible ? 'animate-enter' : 'animate-leave'
            } max-w-md w-full bg-surface border-3 border-border shadow-brutal p-4 flex flex-col gap-1 cursor-pointer hover:bg-base transition-colors`}
          >
            <div className="text-xs uppercase tracking-wider text-tx-secondary font-bold">
              New Message
            </div>
            <div className="text-sm font-bold text-tx-primary">
              {senderName || 'Someone'}
            </div>
          </div>
        ), { duration: 5000 });
      });

      return () => {
        unsubscribe();
      };
    }
  }, [navigate]);

  return null;
}
