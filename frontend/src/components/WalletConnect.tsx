"use client";

import { useState, useEffect } from "react";

export function WalletConnect() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ openwork: string; eth: string } | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const connectWallet = async () => {
    setIsConnecting(true);
    // Simulate wallet connection - in production would use wagmi/ethers
    setTimeout(() => {
      setAddress("0x19Fe...4D3F");
      setBalance({ openwork: "199,609.64", eth: "0.001" });
      setIsConnecting(false);
    }, 1000);
  };

  const disconnectWallet = () => {
    setAddress(null);
    setBalance(null);
  };

  if (address) {
    return (
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm opacity-80">Connected Wallet</p>
            <p className="font-mono text-lg">{address}</p>
          </div>
          <button
            onClick={disconnectWallet}
            className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-sm opacity-80">$OPENWORK Balance</p>
            <p className="text-2xl font-bold">{balance?.openwork}</p>
            <p className="text-xs opacity-60">On Base mainnet</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-sm opacity-80">ETH Balance</p>
            <p className="text-2xl font-bold">{balance?.eth}</p>
            <p className="text-xs opacity-60">Base L2</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
      <div className="text-center">
        <div className="text-4xl mb-4">👛</div>
        <h3 className="text-lg font-semibold mb-2">Connect Your Wallet</h3>
        <p className="text-sm opacity-80 mb-4">
          View your $OPENWORK balance and manage on-chain transactions
        </p>
        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </button>
      </div>
    </div>
  );
}
