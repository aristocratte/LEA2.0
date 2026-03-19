/**
 * Tests pour WelcomeScreen
 *
 * Ces tests valident le comportement du composant WelcomeScreen.
 * Pour exécuter: npm test WelcomeScreen.test.tsx
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { WelcomeScreen } from './WelcomeScreen';
import type { PentestTemplate } from '@/store/pentest-creation-store';

// Mock des templates pour les tests
const mockTemplates: PentestTemplate[] = [
  {
    id: 'test-template',
    name: 'Test Template',
    description: 'A test template',
    icon: '🧪',
    scanType: 'standard',
    thinkingBudget: 'standard',
    estimatedMinutes: [10, 20],
    estimatedCostCents: 10,
    defaultInScope: [],
    tags: ['Test'],
  },
];

describe('WelcomeScreen', () => {
  it('should render title and description', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    expect(screen.getByText('Commencez votre scan de securite')).toBeInTheDocument();
    expect(screen.getByText('Choisissez comment vous souhaitez configurer votre pentest')).toBeInTheDocument();
  });

  it('should render Quick Start and Advanced cards', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    expect(screen.getByText('Quick Start')).toBeInTheDocument();
    expect(screen.getByText('Advanced')).toBeInTheDocument();
  });

  it('should show template grid when Quick Start is selected', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // Cliquer sur Quick Start
    fireEvent.click(screen.getByText('Quick Start'));

    // Vérifier que la grille de templates apparaît
    expect(screen.getByText('Choose a template')).toBeInTheDocument();
  });

  it('should not show template grid when Advanced is selected', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // Cliquer sur Advanced
    fireEvent.click(screen.getByText('Advanced'));

    // Vérifier que la grille de templates n'apparaît pas
    expect(screen.queryByText('Choose a template')).not.toBeInTheDocument();
  });

  it('should disable continue button initially', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // Le bouton doit être disabled tant qu'aucun mode n'est sélectionné
    const continueButton = screen.getByRole('button', { name: /lancer|configurer/i });
    expect(continueButton).toBeDisabled();
  });

  it('should enable continue button when Advanced mode is selected', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // Sélectionner Advanced
    fireEvent.click(screen.getByText('Advanced'));

    // Le bouton doit être enabled
    const continueButton = screen.getByRole('button', { name: /configurer/i });
    expect(continueButton).toBeEnabled();
  });

  it('should call onStart with advanced mode', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // Sélectionner Advanced
    fireEvent.click(screen.getByText('Advanced'));

    // Cliquer sur Continuer
    fireEvent.click(screen.getByRole('button', { name: /configurer/i }));

    // Vérifier l'appel
    expect(mockOnStart).toHaveBeenCalledWith('advanced', undefined);
  });

  it('should show help text for each state', () => {
    const mockOnStart = jest.fn();
    render(<WelcomeScreen onStart={mockOnStart} />);

    // État initial
    expect(screen.getByText('Selectionnez un mode pour commencer')).toBeInTheDocument();

    // Sélectionner Quick Start sans template
    fireEvent.click(screen.getByText('Quick Start'));
    expect(screen.getByText('Choisissez un template pour continuer')).toBeInTheDocument();

    // Sélectionner Advanced
    fireEvent.click(screen.getByText('Advanced'));
    expect(screen.getByText('Cliquez sur "Configurer le scan" pour personnaliser')).toBeInTheDocument();
  });
});

/**
 * INSTRUCTIONS POUR EXÉCUTER LES TESTS
 *
 * 1. Installer les dépendances de test si nécessaire:
 *    npm install --save-dev @testing-library/react @testing-library/jest-dom jest
 *
 * 2. Créer un fichier de configuration Jest (jest.config.js):
 *    module.exports = {
 *      testEnvironment: 'jsdom',
 *      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
 *      moduleNameMapper: {
 *        '^@/(.*)$': '<rootDir>/$1',
 *      },
 *    };
 *
 * 3. Exécuter les tests:
 *    npm test WelcomeScreen.test.tsx
 *
 * 4. Pour les tests avec snapshot:
 *    npm test -- -u
 */
