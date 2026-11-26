import {
  stocktakeReportFromResponse,
  stocktakeReportFromValue,
  type StocktakeReport,
} from '../src/api/stocktakeApi';
import {
  stocktakeItemLocation,
  stocktakeResultLabel,
  stocktakeStatusLabel,
} from '../src/domain/stocktake';

describe('stocktake integration helpers', () => {
  const reportValue = {
    session: {
      id: 'session-1',
      session_number: 'OPN-20261125-001',
      session_date: '2026-11-25',
      status: 'draft',
    },
    summary: {
      expected_count: 2,
      scanned_count: 1,
      missing_count: 1,
      changed_count: 0,
      rejected_count: 1,
    },
    racks: [
      {
        rack: { id: 'rack-a', code: 'RAK-A', name: 'Rak A' },
        expected_count: 2,
        scanned_count: 1,
        missing_count: 1,
        changed_count: 0,
        items: [
          {
            rfid_number: 'RFID-001',
            product_name: 'Susu UHT',
            sku: 'SUSU-250',
            pack_number: 1,
            units: 5,
            base_unit: 'pcs',
            expected_rack: { id: 'rack-a', code: 'RAK-A', name: 'Rak A' },
            result: 'matched',
          },
        ],
      },
    ],
    rejected_scans: [
      { rfid_number: 'RFID-UNKNOWN', error_code: 'RFID_NOT_REGISTERED' },
    ],
  };

  it('normalizes a report while preserving the snapshot grouping', () => {
    const report: StocktakeReport = stocktakeReportFromValue(reportValue);

    expect(report.session.id).toBe('session-1');
    expect(report.session.status).toBe('draft');
    expect(report.summary.expected_count).toBe(2);
    expect(report.racks[0].rack?.code).toBe('RAK-A');
    expect(report.racks[0].items[0].rfid_number).toBe('RFID-001');
    expect(report.rejected_scans[0].error_code).toBe('RFID_NOT_REGISTERED');
  });

  it('maps report values for the site employee UI', () => {
    const report = stocktakeReportFromValue(reportValue);
    const item = report.racks[0].items[0];

    expect(stocktakeStatusLabel(report.session.status)).toBe('Draft');
    expect(stocktakeResultLabel(item.result)).toBe('Sesuai');
    expect(stocktakeItemLocation(item)).toBe('RAK-A · Rak A');
    expect(stocktakeResultLabel('lifecycle_changed')).toBe('Lifecycle berubah');
  });

  it('normalizes a direct session response from session creation', () => {
    const report = stocktakeReportFromValue({
      id: 'session-2',
      session_number: 'OPN-2',
      session_date: '2026-11-25',
      status: 'draft',
    });

    expect(report.session.id).toBe('session-2');
    expect(report.session.session_number).toBe('OPN-2');
  });

  it('prioritizes top-level report and falls back to data', () => {
    expect(stocktakeReportFromResponse({
      success: true,
      report: reportValue,
      data: { session: { id: 'legacy-session' } },
    }).session.id).toBe('session-1');

    expect(stocktakeReportFromResponse({
      success: true,
      data: reportValue,
    }).session.id).toBe('session-1');
  });
});
