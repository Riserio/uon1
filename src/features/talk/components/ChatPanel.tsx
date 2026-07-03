import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageCircle, Send, X } from "lucide-react";
import { useChatMessages } from "../hooks/useChat";

interface ChatPanelProps {
  roomId: string;
  userId: string;
  userName: string;
  onClose?: () => void;
}

/** Painel lateral de chat com auto-scroll e envio resiliente */
export default function ChatPanel({ roomId, userId, userName, onClose }: ChatPanelProps) {
  const { messages, send } = useChatMessages(roomId, userId, userName);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const value = text;
    setText("");
    const ok = await send(value);
    if (!ok && value.trim()) setText(value);
  };

  return (
    <div className="w-80 shrink-0 border-l border-border/50 bg-card flex flex-col max-sm:fixed max-sm:inset-y-0 max-sm:right-0 max-sm:w-full max-sm:z-[115] animate-in slide-in-from-right duration-200">
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
          <MessageCircle className="h-4 w-4 text-primary" /> Chat da reunião
        </h3>
        {onClose && (
          <button onClick={onClose} className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground" aria-label="Fechar chat">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <ScrollArea className="flex-1 p-3">
        {messages.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.<br />Diga olá! 👋</p>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === userId;
              return (
                <div key={m.id} className={`text-xs ${mine ? "text-right" : ""}`}>
                  <span className="font-semibold text-primary text-[11px]">{mine ? "Você" : m.sender_name}</span>
                  <p
                    className={`mt-0.5 px-3 py-2 rounded-2xl inline-block max-w-[90%] text-left text-foreground ${
                      mine ? "bg-primary/10 rounded-tr-sm" : "bg-muted rounded-tl-sm"
                    }`}
                  >
                    {m.message}
                  </p>
                  <p className="text-[9px] text-muted-foreground mt-0.5">
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="p-2 border-t border-border/50 flex gap-1.5">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enviar mensagem..."
          className="text-xs h-9 rounded-full px-4"
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <Button size="sm" className="h-9 w-9 p-0 rounded-full shrink-0" onClick={handleSend} aria-label="Enviar">
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
