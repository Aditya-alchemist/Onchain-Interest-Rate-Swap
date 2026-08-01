import { useState } from 'react';

export default function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  function connect() {
    // placeholder
    setAccount('0x0');
  }
  return { account, connect };
}
