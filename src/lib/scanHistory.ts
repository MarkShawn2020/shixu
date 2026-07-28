import { Directory, File, Paths } from 'expo-file-system';

import type { ScanHistoryRecord, ScanPage } from '../types';

const HISTORY_SCHEMA_VERSION = 1;
const HISTORY_DIRECTORY_NAME = 'scan-history';
const RECORD_FILE_NAME = 'record.json';

type PersistedPage = Omit<ScanPage, 'originalUri' | 'processedUri'> & {
  originalFile: string;
  processedFile?: string;
  originalSourceUri?: string;
  processedSourceUri?: string;
};

type PersistedRecord = {
  version: typeof HISTORY_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  updatedAt: string;
  pages: PersistedPage[];
};

const historyDirectory = () =>
  new Directory(Paths.document, HISTORY_DIRECTORY_NAME);

const recordDirectory = (recordId: string) =>
  new Directory(historyDirectory(), recordId);

const safePageId = (pageId: string) =>
  pageId.replace(/[^a-zA-Z0-9_-]/g, '_');

function ensureDirectory(directory: Directory) {
  directory.create({ idempotent: true, intermediates: true });
}

function isPersistedRecord(value: unknown): value is PersistedRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PersistedRecord>;
  return (
    candidate.version === HISTORY_SCHEMA_VERSION &&
    typeof candidate.id === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.pages)
  );
}

function readPersistedRecord(directory: Directory) {
  const metadata = new File(directory, RECORD_FILE_NAME);
  if (!metadata.exists) return undefined;
  try {
    const parsed = JSON.parse(metadata.textSync()) as unknown;
    return isPersistedRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function hydrateRecord(
  directory: Directory,
  persisted: PersistedRecord,
): ScanHistoryRecord | undefined {
  const pages = persisted.pages.flatMap((page) => {
    const originalFile = new File(directory, page.originalFile);
    const processedFile = page.processedFile
      ? new File(directory, page.processedFile)
      : undefined;
    if (!originalFile.exists) return [];

    const {
      originalFile: _originalFile,
      processedFile: _processedFile,
      originalSourceUri: _originalSourceUri,
      processedSourceUri: _processedSourceUri,
      ...pageData
    } = page;
    return [
      {
        ...pageData,
        originalUri: originalFile.uri,
        processedUri: processedFile?.exists
          ? processedFile.uri
          : originalFile.uri,
        status: 'ready' as const,
      },
    ];
  });

  if (!pages.length) return undefined;
  return {
    id: persisted.id,
    createdAt: persisted.createdAt,
    updatedAt: persisted.updatedAt,
    pages,
  };
}

async function persistImage(
  sourceUri: string,
  destination: File,
  previousSourceUri?: string,
) {
  if (
    sourceUri === destination.uri ||
    (destination.exists && sourceUri === previousSourceUri)
  ) {
    return;
  }
  await new File(sourceUri).copy(destination, { overwrite: true });
}

function removeUnreferencedImages(
  directory: Directory,
  referencedNames: Set<string>,
) {
  for (const entry of directory.list()) {
    if (
      entry instanceof File &&
      entry.name !== RECORD_FILE_NAME &&
      !referencedNames.has(entry.name)
    ) {
      entry.delete();
    }
  }
}

export function createScanHistoryId() {
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadScanHistory(): Promise<ScanHistoryRecord[]> {
  const root = historyDirectory();
  ensureDirectory(root);
  const records = root.list().flatMap((entry) => {
    if (!(entry instanceof Directory)) return [];
    const persisted = readPersistedRecord(entry);
    if (!persisted) return [];
    const hydrated = hydrateRecord(entry, persisted);
    return hydrated ? [hydrated] : [];
  });
  return records.sort(
    (first, second) =>
      Date.parse(second.updatedAt) - Date.parse(first.updatedAt),
  );
}

export async function saveScanHistory(
  recordId: string,
  pages: ScanPage[],
): Promise<ScanHistoryRecord> {
  const readyPages = pages.filter(
    (page) => page.status === 'ready' && page.processedUri,
  );
  if (!readyPages.length) {
    throw new Error('没有可保存的扫描页面');
  }

  const root = historyDirectory();
  const directory = recordDirectory(recordId);
  ensureDirectory(root);
  ensureDirectory(directory);

  const existing = readPersistedRecord(directory);
  const existingPages = new Map(
    existing?.pages.map((page) => [page.id, page]) ?? [],
  );
  const referencedNames = new Set<string>();
  const persistedPages: PersistedPage[] = [];

  for (const page of readyPages) {
    const safeId = safePageId(page.id);
    const originalFileName = `${safeId}-original.jpg`;
    const processedFileName = `${safeId}-processed.jpg`;
    const originalDestination = new File(directory, originalFileName);
    const processedDestination = new File(directory, processedFileName);
    const previous = existingPages.get(page.id);

    await persistImage(
      page.originalUri,
      originalDestination,
      previous?.originalSourceUri,
    );
    await persistImage(
      page.processedUri ?? page.originalUri,
      processedDestination,
      previous?.processedSourceUri,
    );
    referencedNames.add(originalFileName);
    referencedNames.add(processedFileName);

    const {
      originalUri: _originalUri,
      processedUri: _processedUri,
      ...pageData
    } = page;
    persistedPages.push({
      ...pageData,
      status: 'ready',
      originalFile: originalFileName,
      processedFile: processedFileName,
      originalSourceUri: page.originalUri,
      processedSourceUri: page.processedUri ?? page.originalUri,
    });
  }

  const now = new Date().toISOString();
  const persisted: PersistedRecord = {
    version: HISTORY_SCHEMA_VERSION,
    id: recordId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    pages: persistedPages,
  };
  const metadata = new File(directory, RECORD_FILE_NAME);
  metadata.create({ overwrite: true });
  metadata.write(JSON.stringify(persisted));
  removeUnreferencedImages(directory, referencedNames);

  return (
    hydrateRecord(directory, persisted) ?? {
      id: recordId,
      createdAt: persisted.createdAt,
      updatedAt: persisted.updatedAt,
      pages: readyPages,
    }
  );
}

export async function deleteScanHistory(recordId: string) {
  const directory = recordDirectory(recordId);
  if (directory.exists) directory.delete();
}
