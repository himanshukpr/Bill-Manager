'use client'

import { useEffect, useState, useCallback } from 'react'
import { Settings, Plus, Trash2, Save, ArrowLeft, GripVertical, ChevronDown, ChevronUp, X } from 'lucide-react'
import { dairiesApi } from '@/lib/api'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type CategoryPattern = { pattern: string }
type BillItemCategory = {
  id: string
  name: string
  patterns: CategoryPattern[]
}

type DairySettings = {
  evaluateByAmount?: boolean
  billItemCategories?: BillItemCategory[]
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<DairySettings>({ evaluateByAmount: false, billItemCategories: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const [newCategory, setNewCategory] = useState({ id: '', name: '' })
  const [newCategoryOpen, setNewCategoryOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editCategoryName, setEditCategoryName] = useState('')

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await dairiesApi.getSettings()
      setSettings({
        evaluateByAmount: (res.evaluateByAmount as boolean) ?? false,
        billItemCategories: (res.billItemCategories as BillItemCategory[]) ?? [],
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await dairiesApi.updateSettings(settings)
      toast.success('Settings saved successfully')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const addCategory = () => {
    if (!newCategory.id.trim() || !newCategory.name.trim()) return
    const newCat: BillItemCategory = {
      id: newCategory.id.trim().toLowerCase(),
      name: newCategory.name.trim(),
      patterns: [],
    }
    setSettings(prev => ({
      ...prev,
      billItemCategories: [...(prev.billItemCategories ?? []), newCat],
    }))
    setNewCategory({ id: '', name: '' })
    setNewCategoryOpen(false)
  }

  const deleteCategory = (categoryId: string) => {
    setSettings(prev => ({
      ...prev,
      billItemCategories: (prev.billItemCategories ?? []).filter(c => c.id !== categoryId),
    }))
  }

  const addPattern = (categoryId: string) => {
    setSettings(prev => ({
      ...prev,
      billItemCategories: (prev.billItemCategories ?? []).map(cat => {
        if (cat.id === categoryId) {
          return { ...cat, patterns: [...(cat.patterns ?? []), { pattern: '' }] }
        }
        return cat
      }),
    }))
  }

  const updatePattern = (categoryId: string, patternIndex: number, pattern: string) => {
    setSettings(prev => ({
      ...prev,
      billItemCategories: (prev.billItemCategories ?? []).map(cat => {
        if (cat.id === categoryId) {
          const newPatterns = [...(cat.patterns ?? [])]
          newPatterns[patternIndex] = { pattern }
          return { ...cat, patterns: newPatterns }
        }
        return cat
      }),
    }))
  }

  const deletePattern = (categoryId: string, patternIndex: number) => {
    setSettings(prev => ({
      ...prev,
      billItemCategories: (prev.billItemCategories ?? []).map(cat => {
        if (cat.id === categoryId) {
          const newPatterns = (cat.patterns ?? []).filter((_, i) => i !== patternIndex)
          return { ...cat, patterns: newPatterns }
        }
        return cat
      }),
    }))
  }

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }))
  }

  const startEditCategory = (category: BillItemCategory) => {
    setEditingCategoryId(category.id)
    setEditCategoryName(category.name)
  }

  const saveEditCategory = () => {
    if (!editingCategoryId || !editCategoryName.trim()) return
    setSettings(prev => ({
      ...prev,
      billItemCategories: (prev.billItemCategories ?? []).map(cat =>
        cat.id === editingCategoryId ? { ...cat, name: editCategoryName.trim() } : cat
      ),
    }))
    setEditingCategoryId(null)
    setEditCategoryName('')
  }

  const defaultCategories: BillItemCategory[] = [
    { id: 'buffalo', name: 'Buffalo Milk', patterns: [{ pattern: 'buffalo milk' }, { pattern: 'buffalo' }] },
    { id: 'cow', name: 'Cow Milk', patterns: [{ pattern: 'cow milk' }, { pattern: 'cow' }] },
    { id: 'other', name: 'Other', patterns: [] },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  const categories = settings.billItemCategories?.length ? settings.billItemCategories : defaultCategories

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure dairy-wide preferences and bill item categorization.</p>
        </div>
        <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Bill Item Categorization
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Define how delivery items are grouped on bills. Each category can have multiple name patterns.
            Items matching a pattern will be grouped under that category. Patterns are case-insensitive and support partial matching.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {categories.map((cat, index) => (
              <div key={cat.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 bg-muted/30 cursor-pointer"
                  onClick={() => toggleExpanded(cat.id)}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                    <div>
                      {editingCategoryId === cat.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editCategoryName}
                            onChange={e => setEditCategoryName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveEditCategory()}
                            onBlur={saveEditCategory}
                            autoFocus
                            className="w-48"
                          />
                          <Button variant="ghost" size="sm" onClick={saveEditCategory}>
                            <Save className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingCategoryId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cat.name}</span>
                          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">{cat.id}</span>
                          <Button variant="ghost" size="sm" onClick={e => { e.stopPropagation(); startEditCategory(cat) }}>
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {cat.patterns?.length ?? 0} pattern{cat.patterns?.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {expandedCategories[cat.id] ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                      <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); addPattern(cat.id) }} title="Add pattern">
                        <Plus className="h-4 w-4" />
                      </Button>
                      {cat.id !== 'other' && (
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); deleteCategory(cat.id) }} className="text-red-500 hover:text-red-500" title="Delete category">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                {expandedCategories[cat.id] && (
                  <div className="p-4 border-t space-y-2">
                    {cat.patterns?.map((p, pi) => (
                      <div key={pi} className="flex items-center gap-2">
                        <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                        <Input
                          value={p.pattern}
                          onChange={e => updatePattern(cat.id, pi, e.target.value)}
                          placeholder="e.g., buffalo milk, cow, ghee"
                          className="flex-1"
                        />
                        <Button variant="ghost" size="icon" onClick={() => deletePattern(cat.id, pi)} className="text-red-500 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(!cat.patterns || cat.patterns.length === 0) && (
                      <p className="text-sm text-muted-foreground pl-9">No patterns defined. Items not matching other categories will fall here.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <Separator className="my-4" />

          <Button variant="outline" onClick={() => setNewCategoryOpen(true)} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            Add New Category
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Evaluate Bills by Amount</Label>
              <p className="text-sm text-muted-foreground">When enabled, bill calculations prioritize amount over quantity.</p>
            </div>
            <Button
              variant="outline"
              onClick={() => setSettings(prev => ({ ...prev, evaluateByAmount: !prev.evaluateByAmount }))}
              className={settings.evaluateByAmount ? 'bg-primary text-primary-foreground' : ''}
            >
              {settings.evaluateByAmount ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Category</DialogTitle>
            <DialogDescription>
              Create a new bill item category with a unique ID and display name.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label htmlFor="cat-id">Category ID</Label>
              <Input
                id="cat-id"
                value={newCategory.id}
                onChange={e => setNewCategory(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                placeholder="e.g., ghee, paneer"
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground">Lowercase, underscores only. Used internally.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cat-name">Display Name</Label>
              <Input
                id="cat-name"
                value={newCategory.name}
                onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Ghee Products"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">Shown on bills and reports.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewCategory({ id: '', name: '' }); setNewCategoryOpen(false) }}>Cancel</Button>
            <Button onClick={addCategory} disabled={!newCategory.id.trim() || !newCategory.name.trim()}>
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}