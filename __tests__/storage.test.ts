jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const AsyncStorage = require('@react-native-async-storage/async-storage');

const EPC = 'E28011700000000000000001';
const OTHER = '300833B2DDD9014000000001';
const BASE = new Date(2026, 10, 2, 10, 0, 0).getTime();

/**
 * Muat ulang modul storage dengan registry baru supaya cache di memori
 * (tag index & log harian) tidak bocor antar test.
 */
function loadRepos() {
  jest.resetModules();
  const tags = require('../src/storage/tagRepo');
  const logs = require('../src/storage/logRepo');
  return { tags, logs };
}

describe('recordReading (integrasi storage)', () => {
  it('mencatat TAG lalu semua pembacaan ulang sebagai duplikat', async () => {
    const { tags, logs } = loadRepos();

    const first = await tags.recordReading(EPC, {
      nowMs: BASE,
    });
    expect(first.duplicate).toBe(false);
    expect(first.reading.status).toBe('new');
    expect(first.tag.readCount).toBe(1);

    const second = await tags.recordReading(EPC, {
      nowMs: BASE + 1000,
    });
    expect(second.duplicate).toBe(true);
    expect(second.reading.status).toBe('duplicate');
    expect(second.tag.readCount).toBe(2);

    const third = await tags.recordReading(EPC, {
      nowMs: BASE + 10_000,
    });
    expect(third.duplicate).toBe(true);
    expect(third.reading.status).toBe('duplicate');
    expect(third.tag.readCount).toBe(3);

    const rows = await logs.listByDay('2026-11-02');
    expect(rows).toHaveLength(3);
    expect(rows.map((row: { status: string }) => row.status)).toEqual([
      'duplicate',
      'duplicate',
      'new',
    ]);

    const allTags = await tags.listTags();
    expect(allTags).toHaveLength(1);
    expect(allTags[0].readCount).toBe(3);

    await logs.flushLogs();
  });

  it('menyimpan dua tag berbeda secara terpisah', async () => {
    const { tags, logs } = loadRepos();

    await tags.recordReading(EPC, { nowMs: BASE });
    await tags.recordReading(OTHER, {
      nowMs: BASE + 500,
    });

    const allTags = await tags.listTags();
    expect(allTags).toHaveLength(2);

    const rows = await logs.listByDay('2026-11-02');
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row: { epc: string }) => row.epc))).toEqual(
      new Set([EPC, OTHER]),
    );

    await logs.flushLogs();
  });

  it('mengelola lokasi dan status barang melalui inbound, relocation, outbound', async () => {
    const { tags, logs } = loadRepos();
    const inventory = require('../src/storage/inventoryRepo');

    const inbound = await inventory.commitInventoryOperation(
      'inbound',
      [EPC, EPC],
      undefined,
      {
        [EPC]: {
          productName: 'Biji kopi',
          description: 'Arabika medium roast',
          unit: 'gram',
          quantity: 500.5,
          room: 'Gudang A',
          rack: 'R-01',
        },
      },
    );
    expect(inbound.tags).toEqual([EPC]);
    await tags.recordReading(EPC, { nowMs: BASE + 1_000 });
    await expect(tags.getTag(EPC)).resolves.toMatchObject({
      room: 'Gudang A',
      rack: 'R-01',
      productName: 'Biji kopi',
      description: 'Arabika medium roast',
      unit: 'gram',
      quantity: 500.5,
      inventoryStatus: 'in_stock',
    });
    await inventory.commitInventoryOperation('relocation', [EPC], {
      room: 'Gudang B',
      rack: 'R-09',
    });
    await inventory.commitInventoryOperation('outbound', [EPC]);

    await expect(tags.getTag(EPC)).resolves.toMatchObject({
      room: 'Gudang B',
      rack: 'R-09',
      inventoryStatus: 'outbound',
    });
    const transactions = await inventory.listInventoryTransactions();
    expect(
      transactions.map((row: { operation: string }) => row.operation),
    ).toEqual(['outbound', 'relocation', 'inbound']);
    await logs.flushLogs();
  });

  it('memulihkan pengingat penempatan yang tertunda dan merekonsiliasi tag stok', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const pendingRepo = require('../src/storage/pendingPlacementRepo');
    await pendingRepo.registerPendingPlacement(OTHER, BASE);
    await tags.saveTag({
      epc: EPC,
      firstSeenAt: new Date(BASE).toISOString(),
      lastSeenAt: new Date(BASE).toISOString(),
      readCount: 1,
      inventoryStatus: 'in_stock',
    });

    const restored = await pendingRepo.reconcilePendingPlacements();
    expect(restored.map((item: { epc: string }) => item.epc).sort()).toEqual(
      [EPC, OTHER].sort(),
    );
    expect(
      restored.find((item: { epc: string }) => item.epc === OTHER).scannedAt,
    ).toBe(BASE);
  });

  it('menyimpan scan inbound sebagai draft tanpa memasukkan tag ke master', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const inventory = require('../src/storage/inventoryRepo');
    const pendingRepo = require('../src/storage/pendingPlacementRepo');

    await inventory.registerInboundScan(EPC, BASE);

    await expect(tags.getTag(EPC)).resolves.toBeNull();
    await expect(pendingRepo.listPendingPlacements()).resolves.toEqual([
      {
        epc: EPC,
        scannedAt: BASE,
        firstSeenAt: new Date(BASE).toISOString(),
        readCount: 1,
      },
    ]);

    await inventory.commitInventoryOperation('inbound', [EPC], undefined, {
      [EPC]: {
        productName: 'Biji kopi',
        description: 'Arabika',
        unit: 'gram',
        quantity: 500,
        room: 'Gudang A',
        rack: 'Rak 01',
      },
    });
    const history = require('../src/storage/inventoryHistoryRepo');
    await expect(tags.getTag(EPC)).resolves.toMatchObject({ inventoryStatus: 'in_stock' });
    await expect(history.listInventoryHistory()).resolves.toHaveLength(1);
  });

  it('memindahkan draft inbound lama keluar dari master tag saat rekonsiliasi', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const pendingRepo = require('../src/storage/pendingPlacementRepo');
    await tags.saveTag({
      epc: EPC,
      firstSeenAt: new Date(BASE).toISOString(),
      lastSeenAt: new Date(BASE).toISOString(),
      readCount: 3,
      inventoryStatus: 'pending_location',
      productName: 'Kopi',
      description: 'Arabika',
      unit: 'gram',
      quantity: 250.5,
      room: 'Gudang A',
      rack: 'Rak 01',
    });

    await pendingRepo.reconcilePendingPlacements();
    await expect(tags.getTag(EPC)).resolves.toBeNull();
    await expect(pendingRepo.listPendingPlacements()).resolves.toContainEqual(expect.objectContaining({
      epc: EPC,
      readCount: 3,
      productName: 'Kopi',
      quantity: '250.5',
      room: 'Gudang A',
    }));
  });

  it('mengelola daftar pasangan ruangan dan rak tanpa duplikat', async () => {
    await AsyncStorage.clear();
    jest.resetModules();
    const placements = require('../src/storage/placementRepo');

    const saved = await placements.savePlacement({
      room: 'Gudang A',
      rack: 'Rak 01',
    });
    await expect(placements.listPlacements()).resolves.toEqual([saved]);
    await expect(
      placements.savePlacement({ room: ' gudang a ', rack: 'RAK 01' }),
    ).rejects.toThrow('Pasangan ruangan dan rak ini sudah ada di daftar.');

    await placements.deletePlacement(saved.id);
    await expect(placements.listPlacements()).resolves.toEqual([]);
  });

  it('menyimpan detail produk dan penempatan berbeda per tag dalam satu inbound', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const inventory = require('../src/storage/inventoryRepo');
    const transaction = await inventory.commitInventoryOperation(
      'inbound',
      [EPC, OTHER],
      undefined,
      {
        [EPC]: {
          productName: 'Gula',
          description: 'Gula pasir',
          unit: 'gram',
          quantity: 250.5,
          room: 'Gudang A',
          rack: 'Rak 01',
        },
        [OTHER]: {
          productName: 'Susu',
          description: 'Susu cair',
          unit: 'liter',
          quantity: 2,
          room: 'Gudang B',
          rack: 'Rak 03',
        },
      },
    );

    await expect(tags.getTag(EPC)).resolves.toMatchObject({
      productName: 'Gula',
      description: 'Gula pasir',
      unit: 'gram',
      quantity: 250.5,
      room: 'Gudang A',
    });
    await expect(tags.getTag(OTHER)).resolves.toMatchObject({
      productName: 'Susu',
      unit: 'liter',
      quantity: 2,
      room: 'Gudang B',
    });
    expect(transaction.to).toBeUndefined();
    expect(transaction.locationsByEpc[OTHER]).toEqual({ room: 'Gudang B', rack: 'Rak 03' });
  });

  it('melengkapi data lama yang sudah dalam stok tanpa mengubah statusnya', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const inventory = require('../src/storage/inventoryRepo');
    await tags.saveTag({
      epc: EPC,
      firstSeenAt: new Date(BASE).toISOString(),
      lastSeenAt: new Date(BASE).toISOString(),
      readCount: 1,
      inventoryStatus: 'in_stock',
      room: 'Gudang A',
      rack: 'Rak 01',
    });
    await inventory.completeExistingTagDetails(EPC, {
      productName: 'Kopi',
      description: 'Kopi bubuk',
      unit: 'gram',
      quantity: 250,
      room: 'Gudang A',
      rack: 'Rak 01',
    });
    await expect(tags.getTag(EPC)).resolves.toMatchObject({
      inventoryStatus: 'in_stock',
      productName: 'Kopi',
      quantity: 250,
    });
  });

  it('memigrasikan lokasi tag lama ke daftar pilihan satu kali', async () => {
    await AsyncStorage.clear();
    const { tags } = loadRepos();
    const placements = require('../src/storage/placementRepo');
    await tags.saveTag({
      epc: EPC,
      firstSeenAt: new Date(BASE).toISOString(),
      lastSeenAt: new Date(BASE).toISOString(),
      readCount: 1,
      room: 'Gudang Lama',
      rack: 'Rak 02',
      inventoryStatus: 'in_stock',
    });

    const migrated = await placements.listPlacements();
    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({ room: 'Gudang Lama', rack: 'Rak 02' });
    await placements.deletePlacement(migrated[0].id);
    await expect(placements.listPlacements()).resolves.toEqual([]);
  });
});

describe('settings storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.resetModules();
  });

  it('memulihkan nilai default saat preferensi tersimpan tidak valid', async () => {
    await AsyncStorage.setItem(
      'optima:v1:settings',
      JSON.stringify({
        readerMode: 'unsupported',
        haptics: 'yes',
        operator: 123,
      }),
    );

    const settings = require('../src/storage/settingsRepo');
    await expect(settings.loadSettings()).resolves.toEqual({
      operator: '',
      haptics: true,
      readerMode: 'sdk',
    });
  });

  it('memigrasikan preferensi WEDGE lama ke UHF internal', async () => {
    await AsyncStorage.setItem(
      'optima:v1:settings',
      JSON.stringify({ readerMode: 'wedge' }),
    );

    const settings = require('../src/storage/settingsRepo');
    await expect(settings.loadSettings()).resolves.toMatchObject({
      readerMode: 'sdk',
    });
  });
});
