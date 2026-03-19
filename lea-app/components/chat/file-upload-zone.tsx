'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Paperclip, FileText } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string; // text content for text files
}

export interface FileUploadZoneProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ACCEPT_ATTR =
  'text/*,application/json,application/xml,.nmap,.pcap,.yaml,.yml,.csv,.txt,.xml';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isTextFile(file: File): boolean {
  return (
    file.type.startsWith('text/') ||
    file.type === 'application/json' ||
    file.name.endsWith('.txt') ||
    file.name.endsWith('.nmap') ||
    file.name.endsWith('.xml') ||
    file.name.endsWith('.yaml') ||
    file.name.endsWith('.yml') ||
    file.name.endsWith('.csv')
  );
}

async function readFile(file: File): Promise<UploadedFile> {
  const textFile = isTextFile(file);

  let content: string | undefined;
  if (textFile && file.size < 500_000) {
    try {
      content = await file.text();
    } catch {
      // file.text() not available in all environments
    }
  }

  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    size: file.size,
    type: file.type,
    content,
  };
}

async function processFiles(
  rawFiles: FileList | File[],
  onFilesUploaded: (files: UploadedFile[]) => void
): Promise<void> {
  const files = Array.from(rawFiles);
  const valid: File[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      toast.warning(`${file.name} is too large (max 10MB)`);
    } else {
      valid.push(file);
    }
  }

  if (valid.length === 0) return;

  const uploaded = await Promise.all(valid.map(readFile));
  onFilesUploaded(uploaded);

  if (uploaded.length === 1) {
    toast.success(`File attached: ${uploaded[0].name}`);
  } else {
    toast.success(`${uploaded.length} files attached`);
  }
}

// ─── FileUploadZone ───────────────────────────────────────────────────────────

export function FileUploadZone({
  onFilesUploaded,
  children,
  disabled = false,
  className,
}: FileUploadZoneProps): React.ReactElement {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Track nested drag events with a counter to avoid flicker on child elements
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      // Only show overlay when dragging actual files
      if (e.dataTransfer.types.includes('Files')) {
        dragCounterRef.current += 1;
        if (dragCounterRef.current === 1) {
          setIsDraggingOver(true);
        }
      }
    },
    [disabled]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.dataTransfer.dropEffect = 'copy';
      } catch {
        // JSDOM does not support setting dropEffect
      }
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    },
    [disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;
      setIsDraggingOver(false);

      const { files } = e.dataTransfer;
      if (files && files.length > 0) {
        void processFiles(files, onFilesUploaded);
      }
    },
    [disabled, onFilesUploaded]
  );

  return (
    <div
      className={`relative${className ? ` ${className}` : ''}`}
      data-disabled={disabled ? 'true' : undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            key="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-white/90 backdrop-blur-[2px] rounded-none border-2 border-dashed border-zinc-300"
          >
            <Upload className="h-10 w-10 text-zinc-400 mb-3" />
            <p className="text-[15px] font-medium text-zinc-600">
              Drop files here
            </p>
            <p className="text-[13px] text-zinc-400 mt-1">
              TXT, JSON, CSV, NMAP outputs accepted
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── FileAttachButton ─────────────────────────────────────────────────────────

export function FileAttachButton({
  onFilesUploaded,
  className,
}: {
  onFilesUploaded: (files: UploadedFile[]) => void;
  className?: string;
}): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = (): void => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const { files } = e.target;
    if (files && files.length > 0) {
      void processFiles(files, onFilesUploaded);
    }
    // Reset so the same file can be re-attached if removed
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={handleChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      <button
        type="button"
        onClick={handleClick}
        className={
          className ??
          'p-1.5 text-zinc-400 hover:text-zinc-600 transition-colors rounded-md hover:bg-zinc-100'
        }
        aria-label="Attach files"
      >
        <Paperclip className="h-4 w-4" />
      </button>
    </>
  );
}

// ─── FileAttachmentPill ───────────────────────────────────────────────────────

export function FileAttachmentPill({
  file,
  onRemove,
}: {
  file: UploadedFile;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const truncatedName =
    file.name.length > 20 ? `${file.name.slice(0, 20)}…` : file.name;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">
      <FileText className="h-3 w-3 text-zinc-400 shrink-0" />
      <span className="truncate">
        {truncatedName}{' '}
        <span className="text-zinc-400">{formatBytes(file.size)}</span>
      </span>
      <button
        type="button"
        onClick={() => onRemove(file.id)}
        className="ml-0.5 text-zinc-400 hover:text-zinc-600 transition-colors leading-none"
        aria-label={`Remove ${file.name}`}
      >
        ×
      </button>
    </span>
  );
}
