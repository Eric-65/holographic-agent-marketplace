import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { isContractDeployed, getExplorerLink } from "../lib/contracts/config";
import { contractClient } from "../lib/contracts/client";
import { Badge } from "./ui/primitives";

type Props = {
  agentId: string;
  userAddress?: string | null;
};

export default function OnchainStatus({ agentId, userAddress }: Props) {
  const [agentRegistered, setAgentRegistered] = useState<boolean | null>(null);
  const [policyAnchored, setPolicyAnchored] = useState<boolean | null>(null);
  const [attestationEnabled, setAttestationEnabled] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (!isContractDeployed("agent_registry")) {
        setAgentRegistered(false);
      } else {
        try {
          const reg = await contractClient.isAgentRegistered(agentId);
          if (!cancelled) setAgentRegistered(reg);
        } catch {
          if (!cancelled) setAgentRegistered(false);
        }
      }

      if (!userAddress) {
        setPolicyAnchored(false);
      } else if (!isContractDeployed("policy_commitment")) {
        setPolicyAnchored(false);
      } else {
        try {
          const anchored = await contractClient.isPolicyAnchored(userAddress, agentId);
          if (!cancelled) setPolicyAnchored(anchored);
        } catch {
          if (!cancelled) setPolicyAnchored(false);
        }
      }

      setAttestationEnabled(isContractDeployed("execution_attestor"));
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, [agentId, userAddress]);

  const agentStatus = agentRegistered === null ? "Checking..." : agentRegistered ? "ONCHAIN REGISTERED" : "NOT ANCHORED";
  const policyStatus = policyAnchored === null ? "Checking..." : policyAnchored ? "POLICY ANCHORED" : "NOT ANCHORED";
  const execStatus = attestationEnabled ? "ATTESTATION ENABLED" : "NOT ANCHORED";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="faint">Onchain</span>
        <div className="flex items-center gap-1.5">
          <Badge tone={agentRegistered ? "good" : "neutral"}>{agentStatus}</Badge>
          {isContractDeployed("agent_registry") && (
            <a href={getExplorerLink("0x0")} target="_blank" rel="noreferrer" className="faint hover:text-[var(--text)]">
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="faint">Policy</span>
        <Badge tone={policyAnchored ? "good" : "neutral"}>{policyStatus}</Badge>
      </div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="faint">Execution</span>
        <Badge tone={attestationEnabled ? "good" : "neutral"}>{execStatus}</Badge>
      </div>
      {!isContractDeployed("agent_registry") && (
        <div className="text-[10.5px] faint">Contracts not yet deployed to Sepolia — showing NOT ANCHORED until deployment. See contracts/deployments/sepolia.json</div>
      )}
    </div>
  );
}
