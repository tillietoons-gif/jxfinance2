'use client';

import { useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import { Button, Text, Title1, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { Navigation24Regular, Settings24Regular, Board24Regular, VehicleBus24Regular, People24Regular, BookOpen24Regular, Payment24Regular, DocumentBulletList24Regular, DataBarVertical24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { DashboardView } from '@/components/modules/DashboardView';
import { VehiclesView } from '@/components/modules/VehiclesView';
import { VehiclesSheetView } from '@/components/modules/VehiclesSheetView';
import { CustomersView } from '@/components/modules/CustomersView';
import { LedgersView } from '@/components/modules/LedgersView';
import { PaymentsView } from '@/components/modules/PaymentsView';
import { InvoicesView } from '@/components/modules/InvoicesView';
import { ReportsView } from '@/components/modules/ReportsView';
import { SettingsView } from '@/components/modules/SettingsView';

type View = 'dashboard' | 'vehicles' | 'vehicle-sheet' | 'customers' | 'ledgers' | 'payments' | 'invoices' | 'reports' | 'settings';
const NAV_GROUPS = [
  { label: 'Overview', items: [['dashboard', 'Dashboard', Board24Regular, 'Overview and KPIs']] },
  { label: 'Operations', items: [['vehicles', 'Vehicles', VehicleBus24Regular, 'Shipment tracking'], ['vehicle-sheet', 'Vehicle Sheet', VehicleBus24Regular, 'Excel-style vehicle grid'], ['customers', 'Customers', People24Regular, 'Client directory']] },
  { label: 'Finance', items: [['invoices', 'Invoices', DocumentBulletList24Regular, 'Billing and invoicing'], ['payments', 'Payments', Payment24Regular, 'Payment recording'], ['ledgers', 'Ledgers', BookOpen24Regular, 'Dual-ledger accounting']] },
  { label: 'Insights', items: [['reports', 'Reports', DataBarVertical24Regular, 'Analytics and exports']] },
  { label: 'System', items: [['settings', 'Settings', Settings24Regular, 'Company defaults']] },
] as const;

const useStyles = makeStyles({
  root: { display: 'flex', minHeight: '100vh', backgroundColor: tokens.colorNeutralBackground3 },
  sidebar: { width: '260px', flexShrink: 0, display: 'flex', flexDirection: 'column', backgroundColor: tokens.colorNeutralBackground1, borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, position: 'sticky', top: 0, height: '100vh', '@media (max-width: 900px)': { display: 'none' } },
  brand: { padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  brandName: { display: 'block', fontWeight: tokens.fontWeightBold, letterSpacing: '0.16em' },
  nav: { flex: 1, padding: tokens.spacingVerticalM, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  navLabel: { display: 'block', padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, textTransform: 'uppercase', letterSpacing: '0.12em' },
  navButton: { width: '100%', justifyContent: 'flex-start', marginBottom: tokens.spacingVerticalXS, minHeight: '42px', '@media (max-width: 520px)': { minHeight: '44px' } },
  footer: { padding: tokens.spacingVerticalL, borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}` },
  main: { flex: 1, minWidth: 0, padding: tokens.spacingVerticalXXL, maxWidth: '1600px', width: '100%', margin: '0 auto', '@media (max-width: 900px)': { padding: tokens.spacingVerticalL }, '@media (max-width: 520px)': { padding: tokens.spacingVerticalM } },
  mobileBar: { display: 'none', '@media (max-width: 900px)': { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: tokens.spacingVerticalM, backgroundColor: tokens.colorNeutralBackground1, borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`, position: 'sticky', top: 0, zIndex: 10 }, '@media (max-width: 520px)': { padding: tokens.spacingVerticalS } },
  drawerBackdrop: { display: 'none', '@media (max-width: 900px)': { display: 'block', position: 'fixed', inset: 0, zIndex: 19, backgroundColor: tokens.colorNeutralBackgroundAlpha, backdropFilter: 'blur(2px)' } },
  drawer: { display: 'none', '@media (max-width: 900px)': { display: 'flex', position: 'fixed', inset: 0, zIndex: 20, backgroundColor: tokens.colorNeutralBackground1, width: 'min(82vw, 300px)', boxShadow: tokens.shadow64 }, '@media (max-width: 520px)': { width: 'min(88vw, 320px)' } },
});

function Sidebar({ view, onNavigate, mobile, onClose }: { view: View; onNavigate: (v: View) => void; mobile?: boolean; onClose?: () => void }) {
  const styles = useStyles();
  return <aside className={mobile ? mergeClasses(styles.sidebar, styles.drawer) : styles.sidebar}>
    <div className={styles.brand}><Text className={styles.brandName}>JACXI</Text><Text size={200} style={{ color: tokens.colorBrandForeground1 }}>SHIPPING</Text>{mobile && <Button appearance="subtle" icon={<Dismiss24Regular />} aria-label="Close navigation" onClick={onClose} />}</div>
    <nav className={styles.nav} aria-label="Workspace navigation">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <Text className={styles.navLabel}>{group.label}</Text>
          {group.items.map((item) => {
            const [id, label, Icon, description] = item as readonly [string, string, ComponentType, string];
            return (
              <Button key={id} className={styles.navButton} appearance={view === id ? 'primary' : 'subtle'} icon={<Icon />} onClick={() => onNavigate(id as View)} aria-label={description}>
                {label}
              </Button>
            );
          })}
        </div>
      ))}
    </nav>
    <div className={styles.footer}><Text size={200} weight="semibold">Brand values</Text><Text block size={200}>Transparency · Precision · Reliability</Text></div>
  </aside>;
}

export default function Home() {
  const styles = useStyles();
  const [view, setView] = useState<View>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const navigate = (next: View) => { setView(next); setMobileOpen(false); if (next === 'dashboard') refresh(); };
  return <div className={styles.root}>
    <Sidebar view={view} onNavigate={navigate} />
    {mobileOpen && <><button type="button" className={styles.drawerBackdrop} aria-label="Close navigation" onClick={() => setMobileOpen(false)} /><Sidebar view={view} onNavigate={navigate} mobile onClose={() => setMobileOpen(false)} /></>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <header className={styles.mobileBar}><Button appearance="subtle" icon={<Navigation24Regular />} aria-label="Open navigation" onClick={() => setMobileOpen(true)} /><Title1 style={{ fontSize: tokens.fontSizeBase400 }}>JACXI</Title1><div style={{ width: 32 }} /></header>
      <main className={styles.main}><div key={`${view}-${refreshKey}`} className="animate-fade-in">
        {view === 'dashboard' && <DashboardView onNavigate={navigate} />}{view === 'vehicles' && <VehiclesView />}{view === 'vehicle-sheet' && <VehiclesSheetView />}{view === 'customers' && <CustomersView />}{view === 'ledgers' && <LedgersView />}{view === 'payments' && <PaymentsView />}{view === 'invoices' && <InvoicesView />}{view === 'reports' && <ReportsView />}{view === 'settings' && <SettingsView />}
      </div></main>
    </div>
  </div>;
}
