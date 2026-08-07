export function ChatFeedSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 overflow-x-hidden animate-pulse bg-base">
      {[...Array(5)].map((_, i) => {
        const isMine = i % 2 === 0;
        return (
          <div
            key={i}
            className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`border-3 border-border rounded-lg bg-surface shadow-brutal-sm p-4 h-16 ${
                isMine ? 'w-[65%] sm:w-[45%]' : 'w-[60%] sm:w-[40%]'
              }`}
            />
            <div className="w-16 h-3 bg-border/50 border-2 border-border mt-2 rounded-sm" />
          </div>
        );
      })}
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto px-2 mt-2 space-y-3 animate-pulse bg-base">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="w-full flex items-center gap-3 p-3 sm:p-4 border-3 border-border rounded-lg bg-surface shadow-brutal-sm min-h-[56px] sm:min-h-[48px]"
        >
          {/* Circular avatar placeholder */}
          <div className="w-10 h-10 rounded-full border-3 border-border bg-border flex-shrink-0" />
          
          <div className="flex-1 space-y-2.5">
            {/* Title placeholder */}
            <div className="w-[45%] h-3.5 bg-border rounded-sm" />
            {/* Subtitle placeholder */}
            <div className="w-[70%] h-3 bg-border/60 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}
