import React, { useEffect, useMemo, useState } from 'react';

const defaultGetRowId = (row, index) => row.id || row.uid || row.docId || String(index);

const normalizeText = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return '';
};

const AdminDataTable = ({
    columns = [],
    rows = [],
    getRowId = defaultGetRowId,
    searchPlaceholder = '검색',
    pageSize = 50,
    selectable = false,
    renderSelectionActions,
    onRowClick,
    emptyMessage = '표시할 데이터가 없습니다.',
    initialSortKey,
    className = '',
}) => {
    const [query, setQuery] = useState('');
    const [sortState, setSortState] = useState({ key: initialSortKey || null, direction: 'asc' });
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState(() => new Set());

    const searchableRows = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(row => columns.some(col => {
            if (col.searchable === false) return false;
            const raw = col.searchValue ? col.searchValue(row) : row[col.key];
            return normalizeText(raw).toLowerCase().includes(q);
        }));
    }, [rows, columns, query]);

    const sortedRows = useMemo(() => {
        if (!sortState.key) return searchableRows;
        const col = columns.find(c => c.key === sortState.key);
        if (!col) return searchableRows;
        const dir = sortState.direction === 'desc' ? -1 : 1;
        return [...searchableRows].sort((a, b) => {
            const av = col.sortValue ? col.sortValue(a) : a[col.key];
            const bv = col.sortValue ? col.sortValue(b) : b[col.key];
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
            return normalizeText(av).localeCompare(normalizeText(bv), 'ko-KR', { numeric: true }) * dir;
        });
    }, [searchableRows, columns, sortState]);

    const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pagedRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const selectedRows = useMemo(() => {
        return rows.filter((row, index) => selectedIds.has(getRowId(row, index)));
    }, [rows, selectedIds, getRowId]);

    useEffect(() => {
        setPage(1);
    }, [query, sortState.key, sortState.direction]);

    const toggleSort = (col) => {
        if (col.sortable === false) return;
        setSortState(prev => {
            if (prev.key !== col.key) return { key: col.key, direction: 'asc' };
            if (prev.direction === 'asc') return { key: col.key, direction: 'desc' };
            return { key: null, direction: 'asc' };
        });
    };

    const clearSelection = () => setSelectedIds(new Set());
    const removeSelection = (ids) => {
        const idsToRemove = new Set(Array.isArray(ids) ? ids : []);
        if (idsToRemove.size === 0) return;
        setSelectedIds(prev => {
            const next = new Set(prev);
            idsToRemove.forEach(id => next.delete(id));
            return next;
        });
    };

    const toggleRow = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const visibleIds = pagedRows.map((row, index) => getRowId(row, (currentPage - 1) * pageSize + index));
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

    const toggleVisible = () => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (allVisibleSelected) visibleIds.forEach(id => next.delete(id));
            else visibleIds.forEach(id => next.add(id));
            return next;
        });
    };

    const renderCell = (row, col, rowIndex) => {
        if (col.render) return col.render(row, rowIndex);
        return normalizeText(row[col.key]);
    };

    return (
        <div className={`rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden ${className}`}>
            <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                    type="search"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full md:max-w-sm rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <div className="text-xs font-bold text-slate-400">
                    총 {sortedRows.length}건 · {currentPage}/{pageCount}페이지
                </div>
            </div>

            {selectable && selectedIds.size > 0 && (
                <div className="border-b border-indigo-100 bg-indigo-50 px-4 py-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm font-black text-indigo-800">{selectedIds.size}명 선택됨</p>
                    <div className="flex flex-wrap items-center gap-2">
                        {renderSelectionActions?.({
                            selectedRows,
                            selectedIds: Array.from(selectedIds),
                            clearSelection,
                            removeSelection,
                        })}
                        <button type="button" onClick={clearSelection} className="px-3 py-2 rounded-lg bg-white border border-indigo-100 text-xs font-bold text-indigo-700">
                            선택 해제
                        </button>
                    </div>
                </div>
            )}

            <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50">
                        <tr>
                            {selectable && (
                                <th className="w-10 px-4 py-3 text-left">
                                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} className="rounded border-slate-300" />
                                </th>
                            )}
                            {columns.map(col => (
                                <th key={col.key} className={`px-4 py-3 text-left text-xs font-black text-slate-500 ${col.className || ''}`}>
                                    <button
                                        type="button"
                                        onClick={() => toggleSort(col)}
                                        className={`inline-flex items-center gap-1 ${col.sortable === false ? 'cursor-default' : 'hover:text-slate-900'}`}
                                    >
                                        {col.header}
                                        {sortState.key === col.key && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {pagedRows.map((row, pageIndex) => {
                            const absoluteIndex = (currentPage - 1) * pageSize + pageIndex;
                            const rowId = getRowId(row, absoluteIndex);
                            return (
                                <tr
                                    key={rowId}
                                    onClick={() => onRowClick?.(row)}
                                    className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50'}
                                >
                                    {selectable && (
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <input type="checkbox" checked={selectedIds.has(rowId)} onChange={() => toggleRow(rowId)} className="rounded border-slate-300" />
                                        </td>
                                    )}
                                    {columns.map(col => (
                                        <td key={col.key} className={`px-4 py-3 text-sm text-slate-700 ${col.cellClassName || ''}`}>
                                            {renderCell(row, col, absoluteIndex)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="md:hidden divide-y divide-slate-100">
                {pagedRows.map((row, pageIndex) => {
                    const absoluteIndex = (currentPage - 1) * pageSize + pageIndex;
                    const rowId = getRowId(row, absoluteIndex);
                    return (
                        <div key={rowId} className="p-4" onClick={() => onRowClick?.(row)}>
                            <div className="flex items-start gap-3">
                                {selectable && (
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(rowId)}
                                        onChange={() => toggleRow(rowId)}
                                        onClick={e => e.stopPropagation()}
                                        className="mt-1 rounded border-slate-300"
                                    />
                                )}
                                <div className="min-w-0 flex-1 space-y-2">
                                    {columns.map(col => (
                                        <div key={col.key} className="flex justify-between gap-3 text-sm">
                                            <span className="shrink-0 text-xs font-black text-slate-400">{col.mobileLabel || col.header}</span>
                                            <span className="min-w-0 text-right font-semibold text-slate-700">{renderCell(row, col, absoluteIndex)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {pagedRows.length === 0 && (
                <div className="px-4 py-12 text-center text-sm font-bold text-slate-400">{emptyMessage}</div>
            )}

            <div className="border-t border-slate-100 p-4 flex items-center justify-between">
                <button
                    type="button"
                    onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage <= 1}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40"
                >
                    이전
                </button>
                <span className="text-xs font-bold text-slate-400">{currentPage} / {pageCount}</span>
                <button
                    type="button"
                    onClick={() => setPage(prev => Math.min(pageCount, prev + 1))}
                    disabled={currentPage >= pageCount}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40"
                >
                    다음
                </button>
            </div>
        </div>
    );
};

export default AdminDataTable;
