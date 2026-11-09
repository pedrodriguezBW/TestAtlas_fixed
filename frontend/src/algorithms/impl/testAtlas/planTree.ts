import type { TestAtlasPlan, TestAtlasResult } from '../testAtlasModel'

// Text tree of the review (app.js renderReviewTree): every planned folder,
// including empty ones, with the status of each file after the name.

interface Node { name: string; status: string; children: Map<string, Node> }

const treeText = (entries: Array<[string, string]>): string => {
    const tree: Node = { name: '', status: '', children: new Map() }
    for (const [relative, status] of entries) {
        let node = tree
        for (const part of relative.split('\\')) {
            if (!node.children.has(part)) node.children.set(part, { name: part, status: '', children: new Map() })
            node = node.children.get(part)!
        }
        node.status = status
    }
    const lines: string[] = []
    const walk = (node: Node, prefix = '') => {
        const children = [...node.children.values()]
        children.forEach((child, index) => {
            const last = index === children.length - 1
            lines.push(`${prefix}${last ? '└── ' : '├── '}${child.name}${child.status}`)
            walk(child, `${prefix}${last ? '    ' : '│   '}`)
        })
    }
    walk(tree)
    return lines.join('\n')
}

export const planTreeText = (plan: TestAtlasPlan): string => treeText([
    ...plan.directories.map((relative): [string, string] => [relative, '']),
    ...(plan.renamedFolders || []).map((item): [string, string] => [item.to, `  ← ${item.from.split('\\').at(-1)} [reordered · renamed on save]`]),
    ...plan.files.map((file): [string, string] => {
        const savedName = file.relative.split('\\').at(-1)
        const renamed = savedName !== file.name ? `  ← ${file.name}` : ''
        const conflict = !file.conflict ? '' : file.category === 'metadata' ? ' [overwrites the saved file]' : ' [replace after approval]'
        return [file.relative, `${renamed}${conflict}`]
    }),
    ...plan.existingWorkbooks.map((relative): [string, string] => [relative, ' [existing workbook · keep]']),
    ...(plan.generatedFiles || []).map((relative): [string, string] => [relative, ' [checkpoint record]']),
])

/** The same tree for what the save produced. */
export const resultTreeText = (result: TestAtlasResult): string => treeText([
    ...result.directories.map((relative): [string, string] => [relative, '']),
    ...result.renamedFolders.map((item): [string, string] => [item.to, `  ← ${item.from.split('\\').at(-1)} [reordered · renamed]`]),
    ...result.saved.map((relative): [string, string] => [relative, ' [saved]']),
    ...result.generatedFiles.map((relative): [string, string] => [relative, ' [checkpoint record]']),
])
