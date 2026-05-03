import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../error-boundary';

const consoleError = console.error;
beforeAll(() => { console.error = vi.fn(); });
afterAll(() => { console.error = consoleError; });

function BrokenComponent(): never {
  throw new Error('Test render error');
}

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(<ErrorBoundary><p>Safe content</p></ErrorBoundary>);
    expect(screen.getByText('Safe content')).toBeInTheDocument();
  });

  it('renders default error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>Custom error</p>}>
        <BrokenComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('Custom error')).toBeInTheDocument();
  });
});
