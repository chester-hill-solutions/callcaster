interface Message {
  sid?: string;
  status?: string;
  direction?: string;
  body?: string;
  signedUrls?: string[];
  outbound_media?: string[];
  date_created: string | Date;
}

interface MessageListProps {
  messages?: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export default function MessageList({ messages, messagesEndRef }: MessageListProps) {
  return (
    <div className="h-full overflow-y-auto p-4">
      {messages?.length > 0 ? (
        messages.map((message, index) => (
          <div
            key={index}
            className={`message-item mb-4 flex ${
              message.direction !== "inbound" ? "justify-end" : "justify-start"
            }`}
            data-message-id={message.sid}
            data-message-status={message.status}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.direction !== "inbound"
                  ? "bg-secondary text-slate-900"
                  : "bg-white dark:bg-zinc-500"
              }`}
            >
              <p className="text-sm">{message.body}</p>
              {message.signedUrls?.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="mt-2 h-auto max-w-full rounded"
                />
              ))}
              {message.outbound_media?.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`Attachment ${i + 1}`}
                  className="mt-2 h-auto max-w-full rounded"
                />
              ))}
              <div className="mt-1 text-right">
                <small className="text-xs opacity-75">
                  {new Date(message.date_created).toLocaleTimeString()}
                </small>
              </div>
            </div>
          </div>
        ))
      ) : (
        <div className="flex h-full items-center justify-center">
          <p className="text-gray-500">No messages yet</p>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}