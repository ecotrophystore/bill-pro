import React from 'react';

interface FormattedChatMessageProps {
    text: string;
}

export const FormattedChatMessage: React.FC<FormattedChatMessageProps> = ({ text }) => {
    if (!text) return null;

    // Check if the text contains a markdown table
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const flushTable = (key: number) => {
        if (tableHeaders.length > 0 || tableRows.length > 0) {
            elements.push(
                <div key={`table-${key}`} className="my-2.5 overflow-x-auto rounded-lg border border-[#D8CCBC] shadow-sm">
                    <table className="w-full text-left text-xs border-collapse">
                        {tableHeaders.length > 0 && (
                            <thead className="bg-[#FAF5EC] border-b border-[#D8CCBC]">
                                <tr>
                                    {tableHeaders.map((th, hIdx) => (
                                        <th key={hIdx} className="px-2.5 py-1.5 font-bold text-primary-dark">
                                            {renderInlineFormatting(th)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                        )}
                        <tbody>
                            {tableRows.map((row, rIdx) => (
                                <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAF5EC]/40'}>
                                    {row.map((cell, cIdx) => (
                                        <td key={cIdx} className="px-2.5 py-1.5 border-t border-[#E8DDCE] text-primary-dark">
                                            {renderInlineFormatting(cell)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            tableHeaders = [];
            tableRows = [];
        }
        inTable = false;
    };

    const renderInlineFormatting = (str: string) => {
        // Basic parser for **bold**, `code/pill`, *italic*
        const parts = str.split(/(\*\*.*?\*\*|`.*?`|\*.*?\*)/g);
        return parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pIdx} className="font-semibold text-primary-dark">{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return (
                    <span key={pIdx} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        {part.slice(1, -1)}
                    </span>
                );
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={pIdx} className="italic text-secondary">{part.slice(1, -1)}</em>;
            }
            return part;
        });
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Table row detection
        if (line.startsWith('|') && line.endsWith('|')) {
            const rawCells = line.split('|').slice(1, -1).map(c => c.trim());
            // Check if delimiter row like | :--- | :---: |
            if (rawCells.every(c => /^:?-+:?$/.test(c))) {
                // Delimiter row, ignore
                continue;
            }

            if (!inTable) {
                inTable = true;
                tableHeaders = rawCells;
            } else {
                tableRows.push(rawCells);
            }
            continue;
        } else if (inTable) {
            flushTable(i);
        }

        // Horizontal rule
        if (line === '---' || line === '***') {
            elements.push(<hr key={i} className="my-2 border-t border-[#E2D7C8]" />);
            continue;
        }

        // Headers
        if (line.startsWith('### ')) {
            elements.push(
                <h4 key={i} className="text-xs sm:text-sm font-bold text-primary-dark mt-2 mb-1 flex items-center gap-1.5">
                    {renderInlineFormatting(line.slice(4))}
                </h4>
            );
            continue;
        }
        if (line.startsWith('## ')) {
            elements.push(
                <h3 key={i} className="text-sm font-bold text-primary-dark mt-2.5 mb-1.5">
                    {renderInlineFormatting(line.slice(3))}
                </h3>
            );
            continue;
        }

        // Bullet points
        if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(
                <div key={i} className="flex items-start gap-1.5 text-xs text-primary-dark ml-1 my-0.5">
                    <span className="text-primary font-bold">•</span>
                    <span className="flex-1">{renderInlineFormatting(line.slice(2))}</span>
                </div>
            );
            continue;
        }

        // Numbered list (e.g. 1. Item)
        const numMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numMatch) {
            elements.push(
                <div key={i} className="flex items-start gap-1.5 text-xs text-primary-dark ml-1 my-0.5">
                    <span className="text-primary font-bold text-[11px] min-w-[14px]">{numMatch[1]}.</span>
                    <span className="flex-1">{renderInlineFormatting(numMatch[2])}</span>
                </div>
            );
            continue;
        }

        // Empty line
        if (!line) {
            elements.push(<div key={i} className="h-1.5" />);
            continue;
        }

        // Normal paragraph
        elements.push(
            <p key={i} className="text-xs leading-relaxed text-primary-dark">
                {renderInlineFormatting(line)}
            </p>
        );
    }

    if (inTable) {
        flushTable(lines.length);
    }

    return <div className="space-y-1">{elements}</div>;
};

