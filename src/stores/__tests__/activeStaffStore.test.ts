import { useActiveStaffStore, type StaffMember } from '../activeStaffStore';
import { fetchMyStaff } from '../../services/graphql/staff';
import { resolvePermissions } from '../../types/permissions';
import { ActivityLog } from '../../utils/logActivity';

jest.mock('../../services/graphql/staff', () => ({ fetchMyStaff: jest.fn() }));
// Only resolvePermissions is stubbed. permissionsFromGroups must stay real —
// the store expands granted groups through it, and a stubbed-away expansion
// makes the override path silently resolve to "no permissions".
jest.mock('../../types/permissions', () => ({
  ...jest.requireActual('../../types/permissions'),
  resolvePermissions: jest.fn().mockReturnValue({ canProcessPayment: true, canVoidOrder: false }),
}));
jest.mock('../../utils/logActivity', () => ({
  ActivityLog: {
    shiftStarted: jest.fn().mockResolvedValue(undefined),
    shiftEnded: jest.fn().mockResolvedValue(undefined),
  },
}));

const makeStaff = (overrides = {}): StaffMember => ({
  id: 'staff-001',
  name: 'Maria Santos',
  role: 'STAFF',
  email: 'maria@example.com',
  phone: '09171234567',
  isActive: true,
  isArchived: false,
  permissions: {},
  branchIds: ['branch-001'],
  branchAccess: [],
  ...overrides,
});

const MERCHANT_ID = 'merchant-001';
const BRANCH = 'branch-001';

beforeEach(() => {
  useActiveStaffStore.setState({
    activeStaff: null,
    effectivePermissions: null,
    staffList: [],
    shiftStartedAt: null,
    selectorVisible: false,
    startingCash: 0,
    cashMovements: [],
  });
  jest.clearAllMocks();
  (fetchMyStaff as jest.Mock).mockResolvedValue([]);
  (ActivityLog.shiftStarted as jest.Mock).mockResolvedValue(undefined);
  (ActivityLog.shiftEnded as jest.Mock).mockResolvedValue(undefined);
});

describe('useActiveStaffStore', () => {
  // ─── loadStaffList ────────────────────────────────────────────────────────────

  it('HP: loadStaffList sets staffList from fetchMyStaff result', async () => {
    const staff = [makeStaff({ id: 'staff-001' }), makeStaff({ id: 'staff-002', name: 'Juan Cruz' })];
    (fetchMyStaff as jest.Mock).mockResolvedValue(staff);

    const { loadStaffList } = useActiveStaffStore.getState();
    await loadStaffList(MERCHANT_ID);

    expect(useActiveStaffStore.getState().staffList).toEqual(staff);
  });

  it('EC: loadStaffList on error — staffList unchanged, no throw (silently logs)', async () => {
    const existingList = [makeStaff()];
    useActiveStaffStore.setState({ staffList: existingList });
    (fetchMyStaff as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { loadStaffList } = useActiveStaffStore.getState();

    await expect(loadStaffList(MERCHANT_ID)).resolves.toBeUndefined();
    expect(useActiveStaffStore.getState().staffList).toEqual(existingList);
  });

  // ─── startShift ───────────────────────────────────────────────────────────────

  it('HP: startShift sets activeStaff, effectivePermissions, shiftStartedAt, selectorVisible=false', async () => {
    useActiveStaffStore.setState({ selectorVisible: true });
    const staff = makeStaff();

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, BRANCH);

    const state = useActiveStaffStore.getState();
    expect(state.activeStaff).toEqual(staff);
    expect(state.effectivePermissions).toEqual({ canProcessPayment: true, canVoidOrder: false });
    expect(state.shiftStartedAt).toBeInstanceOf(Date);
    expect(state.selectorVisible).toBe(false);
  });

  // Grants come from the member's stored per-branch access — NOT from the
  // `permissions` object the client happens to be holding. A tampered or stale
  // client map must not grant anything.
  it('HP: startShift ignores staff.permissions and resolves from branch access', async () => {
    const staff = makeStaff({ role: 'STAFF', permissions: { canVoidOrder: true } });

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, BRANCH);

    expect(resolvePermissions).toHaveBeenCalledTimes(1);
    expect(resolvePermissions).toHaveBeenCalledWith('STAFF', {});
  });

  it('HP: startShift expands the groups granted on the shift branch', async () => {
    const staff = makeStaff({
      role: 'STAFF',
      branchAccess: [{ branchId: BRANCH, groups: ['ORDERS'] }],
    });

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, BRANCH);

    const [, overrides] = (resolvePermissions as jest.Mock).mock.calls[0];
    expect(overrides.canCreateOrder).toBe(true);
    expect(overrides.canConfirmPickup).toBe(true);
    // A group that was not granted stays off.
    expect(overrides.canAddService).toBe(false);
  });

  // The point of per-branch grants: a shift in one branch must not inherit what
  // this person may do in another.
  it('SEC: grants held on ANOTHER branch do not apply to this shift', async () => {
    const staff = makeStaff({
      role: 'STAFF',
      branchAccess: [{ branchId: 'branch-999', groups: ['ORDERS'] }],
    });

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, BRANCH);

    expect(resolvePermissions).toHaveBeenCalledWith('STAFF', {});
  });

  it('EC: an unknown shift branch grants nothing rather than falling open', async () => {
    const staff = makeStaff({
      role: 'STAFF',
      branchAccess: [{ branchId: BRANCH, groups: ['ORDERS'] }],
    });

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, null);

    expect(resolvePermissions).toHaveBeenCalledWith('STAFF', {});
  });

  it('HP: startShift calls ActivityLog.shiftStarted with merchantId and actor', async () => {
    const staff = makeStaff({ id: 'staff-001', name: 'Maria Santos', role: 'STAFF' });

    const { startShift } = useActiveStaffStore.getState();
    await startShift(staff, MERCHANT_ID, BRANCH);

    expect(ActivityLog.shiftStarted).toHaveBeenCalledTimes(1);
    expect(ActivityLog.shiftStarted).toHaveBeenCalledWith(
      MERCHANT_ID,
      { id: 'staff-001', name: 'Maria Santos', role: 'STAFF' },
    );
  });

  it('HP: startShift returns { success: true }', async () => {
    const staff = makeStaff();

    const { startShift } = useActiveStaffStore.getState();
    const result = await startShift(staff, MERCHANT_ID, BRANCH);

    expect(result).toEqual({ success: true });
  });

  it('EC: startShift when ActivityLog.shiftStarted throws — returns { success: false, error: "..." }', async () => {
    (ActivityLog.shiftStarted as jest.Mock).mockRejectedValue(new Error('Log service unavailable'));
    const staff = makeStaff();

    const { startShift } = useActiveStaffStore.getState();
    const result = await startShift(staff, MERCHANT_ID, BRANCH);

    expect(result).toEqual({ success: false, error: 'Could not start shift. Please try again.' });
  });

  it('EC: startShift when resolvePermissions throws — returns { success: false, error: "..." }', async () => {
    (resolvePermissions as jest.Mock).mockImplementation(() => { throw new Error('Invalid role'); });
    const staff = makeStaff();

    const { startShift } = useActiveStaffStore.getState();
    const result = await startShift(staff, MERCHANT_ID, BRANCH);

    expect(result).toEqual({ success: false, error: 'Could not start shift. Please try again.' });
  });

  // ─── endShift ─────────────────────────────────────────────────────────────────

  it('HP: endShift clears activeStaff, effectivePermissions, shiftStartedAt, startingCash, cashMovements', async () => {
    useActiveStaffStore.setState({
      activeStaff: makeStaff(),
      effectivePermissions: { canCreateOrder: true, canCancelPaidOrder: false } as unknown as import('../../types/permissions').PermissionMap,
      shiftStartedAt: new Date(),
      startingCash: 500,
      cashMovements: [{ id: 'IN:123', type: 'IN', amount: 100, note: 'opening', at: new Date().toISOString() }],
    });

    const { endShift } = useActiveStaffStore.getState();
    await endShift(MERCHANT_ID);

    const state = useActiveStaffStore.getState();
    expect(state.activeStaff).toBeNull();
    expect(state.effectivePermissions).toBeNull();
    expect(state.shiftStartedAt).toBeNull();
    expect(state.startingCash).toBe(0);
    expect(state.cashMovements).toEqual([]);
  });

  it('HP: endShift calls ActivityLog.shiftEnded with correct merchantId and durationMinutes', async () => {
    const shiftStart = new Date(Date.now() - 90 * 60 * 1000); // 90 minutes ago
    useActiveStaffStore.setState({
      activeStaff: makeStaff({ id: 'staff-001', name: 'Maria Santos', role: 'STAFF' }),
      shiftStartedAt: shiftStart,
    });

    const { endShift } = useActiveStaffStore.getState();
    await endShift(MERCHANT_ID);

    expect(ActivityLog.shiftEnded).toHaveBeenCalledTimes(1);
    const [calledMerchantId, calledActor, calledDuration] = (ActivityLog.shiftEnded as jest.Mock).mock.calls[0];
    expect(calledMerchantId).toBe(MERCHANT_ID);
    expect(calledActor).toEqual({ id: 'staff-001', name: 'Maria Santos', role: 'STAFF' });
    // Allow ±2 minutes of drift from test timing
    expect(calledDuration).toBeGreaterThanOrEqual(88);
    expect(calledDuration).toBeLessThanOrEqual(92);
  });

  it('HP: endShift with no shiftStartedAt passes durationMinutes=0', async () => {
    useActiveStaffStore.setState({
      activeStaff: makeStaff(),
      shiftStartedAt: null,
    });

    const { endShift } = useActiveStaffStore.getState();
    await endShift(MERCHANT_ID);

    const [, , calledDuration] = (ActivityLog.shiftEnded as jest.Mock).mock.calls[0];
    expect(calledDuration).toBe(0);
  });

  it('EC: endShift when no activeStaff — returns immediately, no ActivityLog call', async () => {
    useActiveStaffStore.setState({ activeStaff: null });

    const { endShift } = useActiveStaffStore.getState();
    await endShift(MERCHANT_ID);

    expect(ActivityLog.shiftEnded).not.toHaveBeenCalled();
  });

  // ─── showSelector / hideSelector ─────────────────────────────────────────────

  it('HP: showSelector sets selectorVisible=true', () => {
    useActiveStaffStore.setState({ selectorVisible: false });

    const { showSelector } = useActiveStaffStore.getState();
    showSelector();

    expect(useActiveStaffStore.getState().selectorVisible).toBe(true);
  });

  it('HP: hideSelector sets selectorVisible=false', () => {
    useActiveStaffStore.setState({ selectorVisible: true });

    const { hideSelector } = useActiveStaffStore.getState();
    hideSelector();

    expect(useActiveStaffStore.getState().selectorVisible).toBe(false);
  });

  // ─── getActor ─────────────────────────────────────────────────────────────────

  it('HP: getActor with activeStaff — returns { id, name, role } from activeStaff', () => {
    const staff = makeStaff({ id: 'staff-001', name: 'Maria Santos', role: 'STAFF' });
    useActiveStaffStore.setState({ activeStaff: staff });

    const { getActor } = useActiveStaffStore.getState();
    const actor = getActor({ id: 'owner-999', name: 'Owner Name' });

    expect(actor).toEqual({ id: 'staff-001', name: 'Maria Santos', role: 'STAFF' });
  });

  it('HP: getActor without activeStaff — returns ownerFallback with role "OWNER"', () => {
    useActiveStaffStore.setState({ activeStaff: null });

    const { getActor } = useActiveStaffStore.getState();
    const actor = getActor({ id: 'owner-999', name: 'Owner Name' });

    expect(actor).toEqual({ id: 'owner-999', name: 'Owner Name', role: 'OWNER' });
  });

  // ─── setStartingCash ─────────────────────────────────────────────────────────

  it('HP: setStartingCash sets startingCash', () => {
    const { setStartingCash } = useActiveStaffStore.getState();
    setStartingCash(1500);

    expect(useActiveStaffStore.getState().startingCash).toBe(1500);
  });

  it('HP: setStartingCash overwrites a previously set value', () => {
    useActiveStaffStore.setState({ startingCash: 500 });

    const { setStartingCash } = useActiveStaffStore.getState();
    setStartingCash(2000);

    expect(useActiveStaffStore.getState().startingCash).toBe(2000);
  });

  // ─── addCashMovement ─────────────────────────────────────────────────────────

  it('HP: addCashMovement appends to cashMovements with correct type/amount/note', () => {
    const { addCashMovement } = useActiveStaffStore.getState();
    addCashMovement('IN', 500, 'opening float');

    const { cashMovements } = useActiveStaffStore.getState();
    expect(cashMovements).toHaveLength(1);
    expect(cashMovements[0]).toMatchObject({ type: 'IN', amount: 500, note: 'opening float' });
    expect(cashMovements[0].id).toMatch(/^IN:/);
    expect(typeof cashMovements[0].at).toBe('string');
  });

  it('HP: addCashMovement multiple times accumulates all movements (preserves previous)', () => {
    const { addCashMovement } = useActiveStaffStore.getState();
    addCashMovement('IN', 500, 'opening float');
    addCashMovement('IN', 200, 'top up');
    addCashMovement('OUT', 100, 'petty cash');

    const { cashMovements } = useActiveStaffStore.getState();
    expect(cashMovements).toHaveLength(3);
    expect(cashMovements[0]).toMatchObject({ type: 'IN', amount: 500, note: 'opening float' });
    expect(cashMovements[1]).toMatchObject({ type: 'IN', amount: 200, note: 'top up' });
    expect(cashMovements[2]).toMatchObject({ type: 'OUT', amount: 100, note: 'petty cash' });
  });

  it('EC: addCashMovement OUT type stores type="OUT" correctly', () => {
    const { addCashMovement } = useActiveStaffStore.getState();
    addCashMovement('OUT', 250, 'cash withdrawal');

    const { cashMovements } = useActiveStaffStore.getState();
    expect(cashMovements).toHaveLength(1);
    expect(cashMovements[0].type).toBe('OUT');
    expect(cashMovements[0].id).toMatch(/^OUT:/);
    expect(cashMovements[0].amount).toBe(250);
    expect(cashMovements[0].note).toBe('cash withdrawal');
  });
});
