import { useState } from 'react';

export default function useLoan() {
  const [loans, setLoans] = useState([] as any[]);
  return { loans, refresh: () => {} };
}
