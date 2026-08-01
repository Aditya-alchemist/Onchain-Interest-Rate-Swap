import { useState } from 'react';

export default function useSwap() {
  const [swaps, setSwaps] = useState([] as any[]);
  return { swaps, refresh: () => {} };
}
