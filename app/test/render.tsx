import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  routerProps?: Omit<MemoryRouterProps, 'children'>;
}

export function renderWithRouter(ui: ReactElement, options: Options = {}) {
  const { route = '/', routerProps, ...renderOptions } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]} {...routerProps}>
        {children}
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}
