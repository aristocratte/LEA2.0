'use client';

import { Download, FileJson, FileText, FileCode, FileX } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import type { ChatMessage } from '@/components/pentest/chat-messages';
import { cn } from '@/lib/utils';

export type ExportFormat = 'json' | 'markdown' | 'txt' | 'pdf';

interface ExportOptions {
  format: ExportFormat;
  includeTimestamp: boolean;
  includeMetadata: boolean;
}

function generateExportContent(
  messages: ChatMessage[],
  target: string,
  options: ExportOptions
): string {
  const timestamp = new Date().toISOString();
  
  switch (options.format) {
    case 'json':
      return JSON.stringify({
        target,
        exportedAt: timestamp,
        messageCount: messages.length,
        messages: messages.map(msg => ({
          id: msg.id,
          type: msg.type,
          content: 'content' in msg ? msg.content : undefined,
          timestamp: msg.ts,
          ...('agentName' in msg && { agentName: msg.agentName }),
          ...('agentRole' in msg && { agentRole: msg.agentRole }),
        })),
      }, null, 2);

    case 'markdown':
      let md = `# Pentest Conversation\n\n`;
      md += `**Target:** ${target}\n`;
      md += `**Exported:** ${new Date(timestamp).toLocaleString()}\n`;
      md += `**Messages:** ${messages.length}\n\n`;
      md += `---\n\n`;
      
      for (const msg of messages) {
        const time = options.includeTimestamp 
          ? `<span style="color: #999; font-size: 0.85em;">${new Date(msg.ts).toLocaleTimeString()}</span>\n\n`
          : '';
        
        switch (msg.type) {
          case 'user':
            md += `### User\n\n${time}${msg.content}\n\n---\n\n`;
            break;
          case 'orchestrator':
            md += `### Nia (Orchestrator)\n\n${time}${msg.content}\n\n---\n\n`;
            break;
          case 'thinking':
            md += `<details>\n<summary>Thinking</summary>\n\n${msg.content}\n\n</details>\n\n---\n\n`;
            break;
          case 'agent_spawn':
            md += `### Agent Spawn\n\n${time}Spawned ${msg.agents.length} agents: ${msg.agents.map(a => a.name).join(', ')}\n\n---\n\n`;
            break;
          case 'agent_message':
            md += `### ${msg.agentName} (${msg.agentRole})\n\n${time}${msg.content}\n\n---\n\n`;
            break;
          case 'agent_to_agent':
            md += `### ${msg.fromName} -> ${msg.toName}\n\n${time}${msg.content}\n\n---\n\n`;
            break;
        }
      }
      return md;

    case 'txt':
      let txt = `PENTEST CONVERSATION EXPORT\n`;
      txt += `============================\n\n`;
      txt += `Target: ${target}\n`;
      txt += `Exported: ${new Date(timestamp).toLocaleString()}\n`;
      txt += `Messages: ${messages.length}\n\n`;
      txt += `${'='.repeat(50)}\n\n`;
      
      for (const msg of messages) {
        const time = options.includeTimestamp 
          ? `[${new Date(msg.ts).toLocaleTimeString()}] `
          : '';
        
        switch (msg.type) {
          case 'user':
            txt += `${time}[USER]\n${msg.content}\n\n`;
            break;
          case 'orchestrator':
            txt += `${time}[NIA]\n${msg.content}\n\n`;
            break;
          case 'thinking':
            txt += `${time}[THINKING]\n${msg.content}\n\n`;
            break;
          case 'agent_spawn':
            txt += `${time}[AGENT SPAWN]\nSpawned ${msg.agents.length} agents\n\n`;
            break;
          case 'agent_message':
            txt += `${time}[${msg.agentName.toUpperCase()}]\n${msg.content}\n\n`;
            break;
          case 'agent_to_agent':
            txt += `${time}[${msg.fromName} -> ${msg.toName}]\n${msg.content}\n\n`;
            break;
        }
      }
      return txt;

    default:
      return '';
  }
}

function generatePDF(
  messages: ChatMessage[],
  target: string,
  options: ExportOptions
): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  let y = 20;

  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Pentest Conversation Report', margin, y);
  y += 10;

  // Metadata
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Target: ${target}`, margin, y);
  y += 6;
  doc.text(`Exported: ${new Date().toLocaleString()}`, margin, y);
  y += 6;
  doc.text(`Messages: ${messages.length}`, margin, y);
  y += 12;

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Messages
  for (const msg of messages) {
    // Check for page break
    if (y > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }

    // Timestamp
    if (options.includeTimestamp) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(new Date(msg.ts).toLocaleTimeString(), margin, y);
      y += 5;
    }

    // Sender/Type
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    
    let sender = '';
    switch (msg.type) {
      case 'user':
        sender = 'User';
        break;
      case 'orchestrator':
        sender = 'Nia (Orchestrator)';
        break;
      case 'thinking':
        sender = 'Thinking';
        break;
      case 'agent_spawn':
        sender = 'Agent Spawn';
        break;
      case 'agent_message':
        sender = `${msg.agentName} (${msg.agentRole})`;
        break;
      case 'agent_to_agent':
        sender = `${msg.fromName} -> ${msg.toName}`;
        break;
    }
    doc.text(sender, margin, y);
    y += 6;

    // Content
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    
    const content = 'content' in msg && msg.content ? msg.content : '';
    const lines = doc.splitTextToSize(content, pageWidth - 2 * margin);
    
    for (const line of lines) {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 4.5;
    }

    y += 8;
  }

  return doc;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ExportConversationProps {
  messages: ChatMessage[];
  target: string;
  className?: string;
}

export function ExportConversation({ messages, target, className }: ExportConversationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeTimestamp, setIncludeTimestamp] = useState(true);

  const handleExport = () => {
    if (format === 'pdf') {
      const doc = generatePDF(messages, target, {
        format,
        includeTimestamp,
        includeMetadata: true,
      });
      const timestamp = new Date().toISOString().split('T')[0];
      const sanitizedTarget = target.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      doc.save(`pentest_${sanitizedTarget}_${timestamp}.pdf`);
    } else {
      const content = generateExportContent(messages, target, {
        format,
        includeTimestamp,
        includeMetadata: true,
      });

      const timestamp = new Date().toISOString().split('T')[0];
      const sanitizedTarget = target.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      
      const extensions: Record<Exclude<ExportFormat, 'pdf'>, string> = {
        json: 'json',
        markdown: 'md',
        txt: 'txt',
      };

      const mimeTypes: Record<Exclude<ExportFormat, 'pdf'>, string> = {
        json: 'application/json',
        markdown: 'text/markdown',
        txt: 'text/plain',
      };

      const filename = `pentest_${sanitizedTarget}_${timestamp}.${extensions[format as Exclude<ExportFormat, 'pdf'>]}`;
      downloadFile(content, filename, mimeTypes[format as Exclude<ExportFormat, 'pdf'>]);
    }
    setIsOpen(false);
  };

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-all duration-150"
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute right-0 top-full mt-2 z-50 w-80 bg-white rounded-2xl border border-zinc-200 shadow-[0_8px_40px_-4px_rgba(0,0,0,0.18)] overflow-hidden"
            >
              <div className="p-4">
                <h3 className="text-[13px] font-semibold text-zinc-900 mb-4">
                  Export Conversation
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-400 mb-2 block">
                      Format
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setFormat('markdown')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-150',
                          format === 'markdown'
                            ? 'border-zinc-900 bg-zinc-50'
                            : 'border-zinc-200 hover:border-zinc-300'
                        )}
                      >
                        <FileCode className="h-4 w-4 text-zinc-600" />
                        <div className="text-left">
                          <span className="text-[11px] font-medium block text-zinc-900">Markdown</span>
                          <span className="text-[10px] text-zinc-400">Readable format</span>
                        </div>
                      </button>
                      <button
                        onClick={() => setFormat('pdf')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-150',
                          format === 'pdf'
                            ? 'border-zinc-900 bg-zinc-50'
                            : 'border-zinc-200 hover:border-zinc-300'
                        )}
                      >
                        <FileText className="h-4 w-4 text-zinc-600" />
                        <div className="text-left">
                          <span className="text-[11px] font-medium block text-zinc-900">PDF</span>
                          <span className="text-[10px] text-zinc-400">Document format</span>
                        </div>
                      </button>
                      <button
                        onClick={() => setFormat('json')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-150',
                          format === 'json'
                            ? 'border-zinc-900 bg-zinc-50'
                            : 'border-zinc-200 hover:border-zinc-300'
                        )}
                      >
                        <FileJson className="h-4 w-4 text-zinc-600" />
                        <div className="text-left">
                          <span className="text-[11px] font-medium block text-zinc-900">JSON</span>
                          <span className="text-[10px] text-zinc-400">Raw data</span>
                        </div>
                      </button>
                      <button
                        onClick={() => setFormat('txt')}
                        className={cn(
                          'flex items-center gap-2 p-2.5 rounded-xl border transition-all duration-150',
                          format === 'txt'
                            ? 'border-zinc-900 bg-zinc-50'
                            : 'border-zinc-200 hover:border-zinc-300'
                        )}
                      >
                        <FileX className="h-4 w-4 text-zinc-600" />
                        <div className="text-left">
                          <span className="text-[11px] font-medium block text-zinc-900">Text</span>
                          <span className="text-[10px] text-zinc-400">Plain text</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <div className={cn(
                      'w-4 h-4 rounded border flex items-center justify-center transition-colors',
                      includeTimestamp ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-300 group-hover:border-zinc-400'
                    )}>
                      {includeTimestamp && (
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 8 8">
                          <path d="M1.5 4l2 2L6.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={includeTimestamp}
                      onChange={(e) => setIncludeTimestamp(e.target.checked)}
                      className="sr-only"
                    />
                    <span className="text-[13px] text-zinc-600">Include timestamps</span>
                  </label>

                  <button
                    onClick={handleExport}
                    disabled={messages.length === 0}
                    className="w-full py-2.5 bg-zinc-900 text-white text-[13px] font-medium rounded-xl hover:bg-zinc-800 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Download {messages.length} messages
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
