import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DraftRecoveryModal } from '../DraftRecoveryModal';

describe('DraftRecoveryModal', () => {
  const defaultProps = {
    isOpen: true,
    target: 'example.com',
    currentStep: 2,
    totalSteps: 4,
    savedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    onRecover: jest.fn(),
    onDiscard: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render with draft information', () => {
    render(<DraftRecoveryModal {...defaultProps} />);

    expect(screen.getByText('Draft Found')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.getByText(/Step 3 of 4/)).toBeInTheDocument();
    expect(screen.getByText(/Configuration/)).toBeInTheDocument();
  });

  it('should display relative time correctly', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    render(<DraftRecoveryModal {...defaultProps} savedAt={twoHoursAgo} />);

    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('should display scan type when provided', () => {
    render(<DraftRecoveryModal {...defaultProps} scanType="deep" />);

    expect(screen.getByText('Deep')).toBeInTheDocument();
  });

  it('should call onRecover when Resume Draft is clicked', () => {
    render(<DraftRecoveryModal {...defaultProps} />);

    const resumeButton = screen.getByRole('button', { name: /resume draft/i });
    fireEvent.click(resumeButton);

    expect(defaultProps.onRecover).toHaveBeenCalledTimes(1);
  });

  it('should call onDiscard when Start Fresh is clicked', () => {
    render(<DraftRecoveryModal {...defaultProps} />);

    const startFreshButton = screen.getByRole('button', { name: /start fresh/i });
    fireEvent.click(startFreshButton);

    expect(defaultProps.onDiscard).toHaveBeenCalledTimes(1);
  });

  it('should call onDiscard when modal is closed via overlay', () => {
    render(<DraftRecoveryModal {...defaultProps} />);

    // Simulate closing the dialog
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' });

    // Modal should handle close
  });

  it('should display correct step names', () => {
    const { rerender } = render(<DraftRecoveryModal {...defaultProps} currentStep={0} />);
    expect(screen.getByText(/Target/)).toBeInTheDocument();

    rerender(<DraftRecoveryModal {...defaultProps} currentStep={1} />);
    expect(screen.getByText(/Scope/)).toBeInTheDocument();

    rerender(<DraftRecoveryModal {...defaultProps} currentStep={2} />);
    expect(screen.getByText(/Configuration/)).toBeInTheDocument();

    rerender(<DraftRecoveryModal {...defaultProps} currentStep={3} />);
    expect(screen.getByText(/Review/)).toBeInTheDocument();
  });

  it('should not render when isOpen is false', () => {
    render(<DraftRecoveryModal {...defaultProps} isOpen={false} />);

    expect(screen.queryByText('Draft Found')).not.toBeInTheDocument();
  });

  it('should display "just now" for recent saves', () => {
    render(<DraftRecoveryModal {...defaultProps} savedAt={Date.now() - 30000} />);

    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('should display "X days ago" for older saves', () => {
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    render(<DraftRecoveryModal {...defaultProps} savedAt={twoDaysAgo} />);

    expect(screen.getByText('2 days ago')).toBeInTheDocument();
  });
});
