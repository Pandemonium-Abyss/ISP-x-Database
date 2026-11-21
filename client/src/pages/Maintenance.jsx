import { PageHeader } from '../components/ui.jsx';
import MaintenanceLogs from '../components/MaintenanceLogs.jsx';

export default function Maintenance() {
  return (
    <>
      <PageHeader title="Maintenance logs" subtitle="Calibrations, repairs and inspections across all instruments. Each log stores instrument-specific readings in a flexible document." />
      <MaintenanceLogs showEquipment />
    </>
  );
}
