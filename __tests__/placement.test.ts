import {
  isInitialPlacementSuccess,
  isReusableSuccess,
} from '../src/api/placementApi';
import { groupPlacementHistory, movementLabel, placementStatusLabel } from '../src/domain/placement';

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
  });

  it('recognizes only the documented final success responses', () => {
    expect(isInitialPlacementSuccess(201)).toBe(true);
    expect(isInitialPlacementSuccess(200)).toBe(false);
    expect(isReusableSuccess(200, { reused: true })).toBe(true);
    expect(isReusableSuccess(201, { reused: true })).toBe(false);
  });

  it('maps backend values for the site employee UI', () => {
    expect(movementLabel('placement')).toBe('Ditempatkan');
    expect(placementStatusLabel('placed')).toBe('Sudah ditempatkan');
  });
});
