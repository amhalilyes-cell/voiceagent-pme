"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface AssistantStatusContextType {
  active: boolean;
  toggle: () => void;
}

const AssistantStatusContext = createContext<AssistantStatusContextType>({
  active: true,
  toggle: () => {},
});

export function AssistantStatusProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("assistant_active");
    if (stored !== null) setActive(stored === "true");
    setMounted(true);
  }, []);

  function toggle() {
    setActive((prev) => {
      const next = !prev;
      localStorage.setItem("assistant_active", String(next));
      return next;
    });
  }

  if (!mounted) return <>{children}</>;
  return (
    <AssistantStatusContext.Provider value={{ active, toggle }}>
      {children}
    </AssistantStatusContext.Provider>
  );
}

export function useAssistantStatus() {
  return useContext(AssistantStatusContext);
}
