import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FileUploadZone, FileAttachButton, FileAttachmentPill } from '../file-upload-zone';
import { toast } from '@/hooks/use-toast';
import type { UploadedFile } from '../file-upload-zone';

vi.mock('@/hooks/use-toast');

Object.defineProperty(window, 'navigator', {
  value: {
    clipboard: {
      writeText: vi.fn(),
    },
  },
  writable: true,
});

describe('FileUploadZone', () => {
  const mockOnFilesUploaded = vi.fn();
  const mockToastSuccess = vi.fn();
  const mockToastWarning = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (toast.success as Mock) = mockToastSuccess;
    (toast.warning as Mock) = mockToastWarning;
  });

  it('should render children correctly', () => {
    render(
      <FileUploadZone onFilesUploaded={mockOnFilesUploaded}>
        <div data-testid="child">Content</div>
      </FileUploadZone>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('should handle file drop', async () => {
    render(
      <FileUploadZone onFilesUploaded={mockOnFilesUploaded}>
        <div data-testid="drop-zone">Drop here</div>
      </FileUploadZone>
    );

    const dropZone = screen.getByTestId('drop-zone').parentElement;
    const file = new File(['test content'], 'test.txt', { type: 'text/plain' });
    const dataTransfer = {
      files: [file],
      items: [],
      types: ['Files'],
    };

    fireEvent.dragOver(dropZone!);
    fireEvent.drop(dropZone!, { dataTransfer });

    await waitFor(() => {
      expect(mockOnFilesUploaded).toHaveBeenCalled();
    });
  });

  it('should reject files over 10MB', async () => {
    render(
      <FileUploadZone onFilesUploaded={mockOnFilesUploaded}>
        <div data-testid="drop-zone-large">Content</div>
      </FileUploadZone>
    );

    const largeContent = new Uint8Array(11 * 1024 * 1024);
    const largeFile = new File([largeContent], 'large.bin', { type: 'application/octet-stream' });
    const dataTransfer = { files: [largeFile] };

    const dropZone = screen.getByTestId('drop-zone-large').parentElement;
    fireEvent.drop(dropZone!, { dataTransfer });

    await waitFor(() => {
      expect(mockToastWarning).toHaveBeenCalledWith('large.bin is too large (max 10MB)');
    });
  });

  it('should be disabled when disabled prop is true', () => {
    render(
      <FileUploadZone onFilesUploaded={mockOnFilesUploaded} disabled>
        <div data-testid="content">Content</div>
      </FileUploadZone>
    );

    const zone = screen.getByTestId('content').parentElement;
    expect(zone).toHaveAttribute('data-disabled', 'true');
  });
});

describe('FileAttachButton', () => {
  const mockOnFilesUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render attach button', () => {
    render(<FileAttachButton onFilesUploaded={mockOnFilesUploaded} />);

    expect(document.querySelector('input[type="file"]')).toBeInTheDocument();
  });

  it('should handle file selection', async () => {
    render(<FileAttachButton onFilesUploaded={mockOnFilesUploaded} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });

    const mockFileList = {
      0: file,
      length: 1,
      item: (i: number) => (i === 0 ? file : null),
      [Symbol.iterator]: function* () { yield file; },
    };

    Object.defineProperty(input, 'files', {
      configurable: true,
      get: () => mockFileList,
    });

    fireEvent.change(input);

    await waitFor(() => {
      expect(mockOnFilesUploaded).toHaveBeenCalled();
    }, { timeout: 3000 });
  });
});

describe('FileAttachmentPill', () => {
  const mockOnRemove = vi.fn();
  const mockFile: UploadedFile = {
    id: 'file-1',
    name: 'test.txt',
    size: 1024,
    type: 'text/plain',
    content: 'File content',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render file name', () => {
    render(<FileAttachmentPill file={mockFile} onRemove={mockOnRemove} />);

    expect(screen.getByText('test.txt')).toBeInTheDocument();
  });

  it('should render file size', () => {
    render(<FileAttachmentPill file={mockFile} onRemove={mockOnRemove} />);

    expect(screen.getByText('1.0 KB')).toBeInTheDocument();
  });

  it('should call onRemove when remove button clicked', () => {
    render(<FileAttachmentPill file={mockFile} onRemove={mockOnRemove} />);

    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);

    expect(mockOnRemove).toHaveBeenCalledWith(mockFile.id);
  });

  it('should indicate text content is available', () => {
    render(<FileAttachmentPill file={mockFile} onRemove={mockOnRemove} />);

    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
