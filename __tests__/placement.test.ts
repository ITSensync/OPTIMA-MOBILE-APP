import {
  isFinalActionSuccess,
  isInitialPlacementSuccess,
  isReusableSuccess,
} from '../src/api/placementApi';
import { groupPlacementHistory, movementLabel, placementStatusLabel } from '../src/domain/placement';
import { summarizeRelocation } from '../src/domain/relocation';

describe('placement integration helpers', () => {
  it('groups history items by client request id', () => {
    const groups = groupPlacementHistory([
      {
        id: '1',
        created_at: '2026-11-19T10:00:00.000Z',
        movement_type: 'placement',
        client_request_id: 'MOBILE-1',
        rack: { id: 'rack-1', code: 'RAK-01', name: 'Rak Susu' },
        placement_status: 'placed',
        rfid_number: 'RFID-001',
      },
      {
        id: '2',
        created_at: '2026-11-19T10:00:01.000Z',
        movement_type: 'placement',
        client_request_id: 'MOBILE-1',
        rack: { id: 'rack-1', code: 'RAK-01', name: 'Rak Susu' },
        placement_status: 'placed',
        rfid_number: 'RFID-002',
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(2);
    expect(groups[0].rack?.code).toBe('RAK-01');
    expect(groups[0].fromRacks).toHaveLength(0);
  });

  it('recognizes only the documented final success responses', () => {
    expect(isInitialPlacementSuccess(201)).toBe(true);
    expect(isInitialPlacementSuccess(200)).toBe(false);
    expect(isReusableSuccess(200, { reused: true })).toBe(true);
    expect(isReusableSuccess(201, { reused: true })).toBe(false);
    expect(isFinalActionSuccess(201, {})).toBe(true);
    expect(isFinalActionSuccess(200, { reused: true })).toBe(true);
  });

  it('maps backend values for the site employee UI', () => {
    expect(movementLabel('placement')).toBe('Ditempatkan');
    expect(placementStatusLabel('placed')).toBe('Sudah ditempatkan');
  });

  it('summarizes relocation by source rack and product', () => {
    const summary = summarizeRelocation([
      {
        rfid_number: 'RFID-A',
        eligible: true,
        product_name: 'Susu UHT 250 ml',
        current_rack: { id: 'a', code: 'RAK-A', name: 'Rak A' },
      },
      {
        rfid_number: 'RFID-B',
        eligible: true,
        product_name: 'Susu UHT 250 ml',
        current_rack: { id: 'b', code: 'RAK-B', name: 'Rak B' },
      },
    ]);

    expect(summary.byRack).toEqual([
      { source: 'RAK-A · Rak A', count: 1 },
      { source: 'RAK-B · Rak B', count: 1 },
    ]);
    expect(summary.byProduct).toEqual([{ product: 'Susu UHT 250 ml', count: 2 }]);
  });

  it('reads nested item data and source racks in relocation history', () => {
    const groups = groupPlacementHistory([
      {
        id: 'movement-1',
        created_at: '2026-11-19T10:00:00.000Z',
        movement_type: 'relocation',
        client_request_id: 'RELOCATION-1',
        rack: { id: 'rack-c', code: 'RAK-C', name: 'Rak C' },
        from_rack: { id: 'rack-a', code: 'RAK-A', name: 'Rak A' },
        item: { rfid_number: 'RFID-001', placement_status: 'placed' },
      },
    ]);

    expect(groups[0].fromRacks[0].code).toBe('RAK-A');
    expect(groups[0].statuses).toEqual(['placed']);
    expect(groups[0].items[0].item?.rfid_number).toBe('RFID-001');
  });
});
