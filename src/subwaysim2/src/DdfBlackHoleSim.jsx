import { SimpleAttractorSim } from './SimpleAttractorSim.jsx';

export default function DdfBlackHoleSim({ onBack }) {
  return <SimpleAttractorSim variant="ddf" onBack={onBack} />;
}