import {useCallback, useMemo, useState} from 'react';
import {
    initializeBlock,
    useBase,
    useCustomProperties,
    useGlobalConfig,
    useRecords,
    useRunInfo,
} from '@airtable/blocks/interface/ui';
import {FieldType} from '@airtable/blocks/interface/models';
import {Cell, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts';
import './style.css';

const MIN_FIELDS = 2;
const MAX_FIELDS = 8;

// Matches the "Total Views - FB IG YT LI" formula field's scope on first load.
const DEFAULT_TABLE_ID = 'tbldpOEVX87oUkUIq'; // Jobs
const DEFAULT_TABLE_NAME = 'Jobs';
const DEFAULT_FIELD_IDS = [
    'fldFOKFhUDISnnwhP', // Facebook Views
    'fldTumIG2P6k9xAuT', // Instagram Views
    'fldstdM7Oa8SCgmA7', // YouTube Views
    'fldutpvlFqmkgnDXk', // LinkedIn Views
];

const LIGHT_COLORS = [
    '#2a78d6',
    '#eb6834',
    '#1baf7a',
    '#eda100',
    '#e87ba4',
    '#008300',
    '#4a3aa7',
    '#e34948',
];
const DARK_COLORS = [
    '#3987e5',
    '#d95926',
    '#199e70',
    '#c98500',
    '#d55181',
    '#008300',
    '#9085e9',
    '#e66767',
];

// Slices below this percent (0-100) skip their direct label to avoid overlapping text.
const MIN_LABEL_PERCENT = 6;

function isNumericResultType(type) {
    return type === FieldType.NUMBER || type === FieldType.CURRENCY || type === FieldType.PERCENT;
}

function isNumericField(field) {
    const config = field.config;
    switch (config.type) {
        case FieldType.NUMBER:
        case FieldType.CURRENCY:
            return true;
        case FieldType.FORMULA:
        case FieldType.ROLLUP:
        case FieldType.MULTIPLE_LOOKUP_VALUES:
            return Boolean(config.options?.result) && isNumericResultType(config.options.result.type);
        default:
            return false;
    }
}

function sumCellValue(record, field) {
    const value = record.getCellValue(field);
    if (field.type === FieldType.MULTIPLE_LOOKUP_VALUES) {
        if (!Array.isArray(value)) {
            return 0;
        }
        return value.reduce((sum, entry) => {
            const lookedUpValue = entry?.value;
            return sum + (typeof lookedUpValue === 'number' ? lookedUpValue : 0);
        }, 0);
    }
    return typeof value === 'number' ? value : 0;
}

function getCustomProperties(base, configuredTableId) {
    const fallbackTable =
        base.getTableByIdIfExists(DEFAULT_TABLE_ID) ||
        base.getTableByNameIfExists(DEFAULT_TABLE_NAME) ||
        base.tables[0];
    const table =
        (typeof configuredTableId === 'string' && base.getTableByIdIfExists(configuredTableId)) ||
        fallbackTable;

    if (!table) {
        return [{key: 'table', label: 'Table', type: 'table'}];
    }

    const fieldProperties = [];
    for (let i = 1; i <= MAX_FIELDS; i++) {
        const defaultFieldId = table.id === fallbackTable.id ? DEFAULT_FIELD_IDS[i - 1] : undefined;
        fieldProperties.push({
            key: `field${i}`,
            label: `Field ${i}${i <= MIN_FIELDS ? ' (required)' : ' (optional)'}`,
            type: 'field',
            table,
            shouldFieldBeAllowed: isNumericField,
            defaultValue: defaultFieldId ? table.getFieldByIdIfExists(defaultFieldId) ?? undefined : undefined,
        });
    }

    return [
        {key: 'table', label: 'Table', type: 'table', defaultValue: table},
        {key: 'title', label: 'Title', type: 'string', defaultValue: table.name},
        {
            key: 'theme',
            label: 'Theme',
            type: 'enum',
            possibleValues: [
                {value: 'light', label: 'Light'},
                {value: 'dark', label: 'Dark'},
            ],
            defaultValue: 'light',
        },
        ...fieldProperties,
    ];
}

function CustomTooltip({active, payload, primaryInk, secondaryInk, surfaceColor}) {
    if (!active || !payload || !payload.length) {
        return null;
    }
    const {name, value, percent, color} = payload[0].payload;
    return (
        <div
            className="rounded-md px-3 py-2 shadow-lg text-sm"
            style={{backgroundColor: surfaceColor, border: `1px solid ${color}`}}
        >
            <div className="flex items-center gap-2 mb-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{backgroundColor: color}} />
                <span style={{color: secondaryInk}}>{name}</span>
            </div>
            <div className="font-semibold text-base" style={{color: primaryInk}}>
                {value.toLocaleString()}
            </div>
            <div style={{color: secondaryInk}}>{percent.toFixed(1)}% of total</div>
        </div>
    );
}

function renderSliceLabel({cx, cy, midAngle, innerRadius, outerRadius, percent}) {
    // `percent` here is the slice's own 0-100 value (our data field overrides
    // recharts' 0-1 fraction), so it matches the legend's calculation directly.
    if (percent < MIN_LABEL_PERCENT) {
        return null;
    }
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) / 2;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#ffffff" fontSize={13} fontWeight={600}>
            {`${percent.toFixed(1)}%`}
        </text>
    );
}

function ElementFrame({isDark, title, children}) {
    return (
        <div className={isDark ? 'dark' : ''}>
            <div className="h-full w-full flex flex-col bg-white dark:bg-gray-gray800 border border-gray-gray100 dark:border-gray-gray700 rounded-lg overflow-hidden">
                <div className="shrink-0 px-4 py-3 border-b border-gray-gray100 dark:border-gray-gray700">
                    <h1 className="text-base font-semibold text-gray-gray800 dark:text-gray-gray100 truncate">
                        {title}
                    </h1>
                </div>
                {children}
            </div>
        </div>
    );
}

function PieChartApp() {
    const base = useBase();
    const runInfo = useRunInfo();
    const globalConfig = useGlobalConfig();
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const configuredTableId = globalConfig.get('table');
    const getCustomPropertiesCallback = useCallback(
        (base) => getCustomProperties(base, configuredTableId),
        [configuredTableId],
    );
    const {customPropertyValueByKey, errorState} = useCustomProperties(getCustomPropertiesCallback);

    const table = customPropertyValueByKey.table || base.tables[0];
    const title = customPropertyValueByKey.title || table.name;
    // This SDK's useColorScheme only reports the OS theme, not the Interface's,
    // so theme is an explicit setting instead (defaults to Light to match Airtable).
    const isDark = customPropertyValueByKey.theme === 'dark';
    const records = useRecords(table);

    const fields = useMemo(() => {
        const seenFieldIds = new Set();
        const selected = [];
        for (let i = 1; i <= MAX_FIELDS; i++) {
            const field = customPropertyValueByKey[`field${i}`];
            if (field && !seenFieldIds.has(field.id)) {
                seenFieldIds.add(field.id);
                selected.push(field);
            }
        }
        return selected;
    }, [customPropertyValueByKey]);

    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
    const surfaceColor = isDark ? '#1a1a19' : '#fcfcfb';
    const primaryInk = isDark ? '#ffffff' : '#0b0b0b';
    const secondaryInk = isDark ? '#c3c2b7' : '#52514e';

    const slices = useMemo(() => {
        const totals = fields.map((field) => {
            const sum = records.reduce((acc, record) => acc + sumCellValue(record, field), 0);
            return {id: field.id, name: field.name, value: sum};
        });
        const grandTotal = totals.reduce((acc, {value}) => acc + value, 0);
        return totals.map((slice, index) => ({
            ...slice,
            percent: grandTotal > 0 ? (slice.value / grandTotal) * 100 : 0,
            color: colors[index % colors.length],
        }));
    }, [fields, records, colors]);

    const grandTotal = slices.reduce((acc, {value}) => acc + value, 0);

    if (errorState) {
        return (
            <ElementFrame isDark={isDark} title="Field totals">
                <div className="flex-1 min-h-0 p-4">
                    <p className="text-red-red">
                        Couldn&apos;t configure this extension: {errorState.error.message}
                    </p>
                </div>
            </ElementFrame>
        );
    }

    if (fields.length < MIN_FIELDS) {
        return (
            <ElementFrame isDark={isDark} title={title}>
                <div className="flex-1 min-h-0 flex items-center justify-center p-4">
                    <div className="max-w-md text-center text-gray-gray600 dark:text-gray-gray300">
                        <p className="font-semibold mb-2">Pick at least 2 fields to chart</p>
                        {runInfo.isPageElementInEditMode ? (
                            <p className="text-sm">
                                Open this element&apos;s settings to choose a table and 2&ndash;8 numeric fields
                                (Number, Currency, Rollup, Formula, or numeric Lookup) whose totals should make up the
                                pie.
                            </p>
                        ) : (
                            <p className="text-sm">This chart hasn&apos;t been configured yet by a page editor.</p>
                        )}
                    </div>
                </div>
            </ElementFrame>
        );
    }

    return (
        <ElementFrame isDark={isDark} title={title}>
            <p className="shrink-0 px-4 pt-3 text-sm text-gray-gray500 dark:text-gray-gray400">
                Sum of each selected field across {records.length.toLocaleString()} record
                {records.length === 1 ? '' : 's'}
            </p>

            {grandTotal === 0 ? (
                <div className="flex-1 min-h-0 flex items-center justify-center p-4">
                    <p className="text-sm text-gray-gray500 dark:text-gray-gray400">
                        All selected fields sum to zero across every record in this table.
                    </p>
                </div>
            ) : (
                <div className="flex-1 min-h-0 flex flex-col sm:flex-row items-center gap-4 p-4">
                    <div className="w-full sm:flex-1 h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={slices}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius="55%"
                                    outerRadius="90%"
                                    paddingAngle={0}
                                    stroke="none"
                                    isAnimationActive={false}
                                    label={renderSliceLabel}
                                    labelLine={false}
                                    onMouseEnter={(_, index) => setHoveredIndex(index)}
                                    onMouseLeave={() => setHoveredIndex(null)}
                                >
                                    {slices.map((slice, index) => (
                                        <Cell
                                            key={slice.id}
                                            fill={slice.color}
                                            opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.5}
                                        />
                                    ))}
                                </Pie>
                                <Tooltip
                                    content={
                                        <CustomTooltip
                                            primaryInk={primaryInk}
                                            secondaryInk={secondaryInk}
                                            surfaceColor={surfaceColor}
                                        />
                                    }
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    <ul className="w-full sm:w-48 shrink-0 space-y-2">
                        {slices.map((slice, index) => (
                            <li
                                key={slice.id}
                                className="flex items-center gap-2 text-sm"
                                onMouseEnter={() => setHoveredIndex(index)}
                                onMouseLeave={() => setHoveredIndex(null)}
                            >
                                <span
                                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                    style={{backgroundColor: slice.color}}
                                />
                                <span className="flex-1 truncate text-gray-gray700 dark:text-gray-gray200">
                                    {slice.name}
                                </span>
                                <span className="text-gray-gray500 dark:text-gray-gray400 tabular-nums">
                                    {slice.percent.toFixed(1)}%
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </ElementFrame>
    );
}

initializeBlock({interface: () => <PieChartApp />});
