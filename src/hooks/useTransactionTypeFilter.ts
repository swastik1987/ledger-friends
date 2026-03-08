import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export type TransactionFilter = 'all' | 'debit' | 'credit';

const STORAGE_KEY = 'expensesync-type-filter';

function readStorage(): Record<string, TransactionFilter> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStorage(trackerId: string, value: TransactionFilter) {
  const data = readStorage();
  data[trackerId] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function useTransactionTypeFilter(trackerId: string): [TransactionFilter, (v: TransactionFilter) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const getInitial = (): TransactionFilter => {
    const urlType = searchParams.get('type');
    if (urlType === 'debit' || urlType === 'credit' || urlType === 'all') return urlType;
    const stored = readStorage()[trackerId];
    if (stored) return stored;
    return 'all';
  };

  const [filter, setFilterState] = useState<TransactionFilter>(getInitial);

  const setFilter = useCallback((value: TransactionFilter) => {
    setFilterState(value);
    writeStorage(trackerId, value);
    setSearchParams(prev => {
      const params = new URLSearchParams(prev);
      params.set('type', value);
      return params;
    }, { replace: true });
  }, [trackerId, setSearchParams]);

  // Sync if URL changes externally
  useEffect(() => {
    const urlType = searchParams.get('type');
    if (urlType === 'debit' || urlType === 'credit' || urlType === 'all') {
      if (urlType !== filter) setFilterState(urlType);
    }
  }, [searchParams]);

  return [filter, setFilter];
}
