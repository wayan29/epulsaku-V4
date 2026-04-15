'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CardContent } from '@/components/ui/card';
import { Loader2, Send, Bot, User, BrainCircuit } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { chatWithGemini, type ChatInput } from '@/ai/flows/chat-flow';
import ProtectedRoute from '@/components/core/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


// The message structure used by the page's state
interface PageMessage {
  role: 'user' | 'model';
  text: string;
}

const availableModels = [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
]

export default function ChatPage() {
  const { toast } = useToast();
  const { user } = useAuth(); // Get user from auth context
  const [messages, setMessages] = useState<PageMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [selectedModel, setSelectedModel] = useState('gemini-2.5-flash');


  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) {
        if(!user) toast({ title: 'Error', description: 'User not logged in.', variant: 'destructive' });
        return;
    };

    const userMessage: PageMessage = { role: 'user', text: input };
    setMessages(prev => [...prev, userMessage]);
    
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    
    try {
      // The flow now manages its own history from the DB, so we only need to send the new message.
      const chatInput: ChatInput = {
        userId: user.id,
        message: currentInput,
        model: `googleai/${selectedModel}`,
      };
      const result = await chatWithGemini(chatInput);
      const modelMessage: PageMessage = { role: 'model', text: result.response };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      toast({
        title: 'Error',
        description: `Failed to get a response: ${errorMessage}`,
        variant: 'destructive',
      });
      // On error, remove the user's message that caused the error to allow retry
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ProtectedRoute requiredPermission="chat_ai">
        <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
        <div className="flex h-[70vh] flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card)] dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-[var(--ui-border)] p-4 dark:border-zinc-800">
                 <Label htmlFor="model-select" className="text-[var(--ui-text)] dark:text-zinc-100">AI Model</Label>
                 <Select value={selectedModel} onValueChange={setSelectedModel} disabled={isLoading}>
                    <SelectTrigger id="model-select" className="mt-2 rounded-xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] focus:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
                        <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                        {availableModels.map(model => (
                            <SelectItem key={model.value} value={model.value}>
                                {model.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                 </Select>
            </div>
            <div ref={scrollAreaRef} className="flex-1 space-y-4 overflow-y-auto bg-[var(--ui-surface)] p-4 dark:bg-zinc-950/50">
            {messages.length === 0 && (
                <div className="flex justify-center items-center h-full">
                    <div className="text-center text-[var(--ui-text-muted)] dark:text-zinc-400">
                        <BrainCircuit size={48} className="mx-auto text-[var(--ui-accent)]" />
                        <p className="mt-2">Mulai percakapan dengan ePulsaku AI</p>
                        <p className="text-xs mt-1">Menggunakan {availableModels.find(m => m.value === selectedModel)?.label || 'AI Model'}</p>
                    </div>
                </div>
            )}
            {messages.map((message, index) => (
                <div
                key={index}
                className={`flex items-start gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
                >
                {message.role === 'model' && (
                    <div className="rounded-full bg-[var(--ui-accent)] p-2 text-white">
                        <Bot size={20} />
                    </div>
                )}
                <div
                    className={`max-w-xs rounded-2xl p-3 text-sm md:max-w-md lg:max-w-lg ${
                    message.role === 'user'
                        ? 'bg-[var(--ui-accent)] text-white'
                        : 'border border-[var(--ui-border)] bg-[var(--ui-card-alt)] text-[var(--ui-text)] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100'
                    }`}
                >
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                </div>
                {message.role === 'user' && (
                    <div className="rounded-full bg-[var(--ui-card-alt)] p-2 text-[var(--ui-text-secondary)] dark:bg-zinc-900 dark:text-zinc-400">
                        <User size={20} />
                    </div>
                )}
                </div>
            ))}
            {isLoading && (
                <div className="flex items-start gap-3 justify-start">
                    <div className="rounded-full bg-[var(--ui-accent)] p-2 text-white">
                        <Bot size={20} />
                    </div>
                    <div className="flex max-w-xs items-center rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-card-alt)] p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        <Loader2 className="h-5 w-5 animate-spin text-[var(--ui-text-secondary)] dark:text-zinc-400" />
                    </div>
                </div>
            )}
            </div>
            <div className="border-t border-[var(--ui-border)] p-4 dark:border-zinc-800">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
                <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ketik pesan Anda..."
                className="flex-1 border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] text-[var(--ui-text)] placeholder:text-[var(--ui-text-secondary)] focus-visible:ring-[var(--ui-accent)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                disabled={isLoading}
                />
                <Button type="submit" className="rounded-xl bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent-hover)]" disabled={isLoading || !input.trim()}>
                {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Send className="h-4 w-4" />
                )}
                <span className="sr-only">Send</span>
                </Button>
            </form>
            </div>
        </div>
        </CardContent>
    </ProtectedRoute>
  );
}
