import { createContext, useContext, ReactNode } from 'react';

const Ctx = createContext<{ isReadOnly: boolean }>({ isReadOnly: false });

export const useReadOnlyScope = () => useContext(Ctx);

export function ReadOnlyScopeProvider({ value, children }: { value: boolean; children: ReactNode }) {
  return (
    <Ctx.Provider value={{ isReadOnly: value }}>
      <div data-readonly={value ? 'true' : 'false'} className={value ? 'averia-readonly' : ''}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
