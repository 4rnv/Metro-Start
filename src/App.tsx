import { useState, useEffect, type ChangeEvent } from 'react'
import tilesData from './data/tiles.json'
import IconMap from './iconMap'

type TileType = 'tiny' | 'normal' | 'wide' | 'large'

type Tile = {
  id: string
  icon: string
  name: string
  url: string
  colour: string
  x: number
  y: number
  type: TileType | string
}

type Settings = {
  gap: number
  transparency: boolean
  opacity: number
  theme: string
  backgroundImage: string
  gridRows: number
  gridCols: number
  horizontalPadding: number
  verticalPadding: number
}

type GridInfo = {
  rows: number
  columns: number
}

const DEFAULT_SETTINGS: Settings = {
  gap: 8,
  transparency: false,
  opacity: 255,
  theme: 'default',
  backgroundImage: '',
  gridRows: 8,
  gridCols: 16,
  horizontalPadding: 160,
  verticalPadding: 160
}

const SETTINGS_KEY = 'metro-settings'
const TILES_KEY = 'metro-tiles'
const TILE_SIZES = {
  tiny: { w: 1, h: 1 },
  normal: { w: 2, h: 2 },
  wide: { w: 4, h: 2 },
  large: { w: 4, h: 4 },
}

const ToHex = (num: number) => {
  let hex = Number(num).toString(16);
  while (hex.length < 2) {
    hex = "0" + hex;
  }
  return hex;
}

const validateURL = (url: string) => {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch (error) {
    return false
  }
}

const validateCustomIcon = (icon: string) => {
  return /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(icon)
}

const GridSect = ({ settings, tiles, setTiles }: { settings: Settings, tiles: Tile[], setTiles: (tiles: Tile[]) => void }) => {
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [contextMenu, setContextMenu] = useState<{ tileId: string; x: number; y: number } | null>(null)
  const [draggedTile, setDraggedTile] = useState<Tile | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null)
  const [newTile, setNewTile] = useState<Partial<Tile>>({
    name: '',
    icon: '',
    url: '',
    colour: '#1BA1E2',
    type: 'normal'
  })
  const [_, setCustomIcon] = useState<string>('')
  const gap = settings.gap
  const gridInfo: GridInfo = {
    "rows": settings.gridRows,
    "columns": settings.gridCols
  }

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    window.addEventListener(
      'resize',
      handleResize
    )
    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      )
    }
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const horizontalPadding = settings.horizontalPadding
  const verticalPadding = settings.verticalPadding
  const availableWidth = viewport.width - horizontalPadding
  const availableHeight = viewport.height - verticalPadding

  const baseTileSize = Math.max(32, Math.floor(Math.min(
    (availableWidth - (gap * (gridInfo.columns - 1))) / gridInfo.columns,
    (availableHeight - (gap * (gridInfo.rows - 1))) / gridInfo.rows
  )))

  const addTile = () => {
    const position = FindNextTilePosition(tiles, newTile.type as TileType, gridInfo)
    if (position.x === 1 && position.y === 1 && tiles.length > 0) {
      const canPlace = isPositionFree(tiles, 1, 1, TILE_SIZES[newTile.type as TileType] ?? TILE_SIZES['normal'])
      if (!canPlace) {
        alert("No space left on the grid for this tile size.")
        return
      }
    }

    const isValidURL = newTile.url ? validateURL(newTile.url) : false
    if (!isValidURL) {
      alert("Invalid URL, must start with http/https")
      return
    }

    if (newTile.icon && newTile.icon.startsWith('data:') && !validateCustomIcon(newTile.icon)) {
      alert("Invalid custom icon: must be a valid PNG, JPEG, WebP, or GIF data URL")
      return
    }

    const tile: Tile = {
      id: crypto.randomUUID(),
      name: newTile.name || '',
      icon: newTile.icon?.startsWith('data:') ? newTile.icon : IconMap[handleURL(newTile.url) as keyof typeof IconMap] || '',
      url: newTile.url || '',
      colour: newTile.colour || '#1BA1E2',
      type: newTile.type || 'normal',
      x: position.x,
      y: position.y
    }
    const updatedTiles = CreateTile(tiles, tile)
    setTiles(updatedTiles)
    setShowAddModal(false)

    setNewTile({
      name: '',
      icon: '',
      url: '',
      colour: '#1BA1E2',
      type: 'normal'
    })
  }

  const handleURL = (url: any) => {
    try {
      const parsed = new URL(url)
      return parsed.hostname
        .replace('www.', '')
    }
    catch {
      return ''
    }
  }

  const openContextMenu = (e: React.MouseEvent, tileId: string) => {
    e.preventDefault()
    setContextMenu({ tileId, x: e.clientX, y: e.clientY })
  }

  const closeContextMenu = () => setContextMenu(null)

  const deleteTile = (id: string) => {
    if (window.confirm(`Are you sure you want to delete this tile?`)) {
      const updated = DeleteTile(tiles, id)
      setTiles(updated)
      closeContextMenu()
    }
  }

  const resizeTile = (id: string, newType: TileType) => {
    const tile = tiles.find(t => t.id === id)
    if (!tile) return

    const updatedTiles = tiles.map(t => {
      if (t.id === id) {
        return { ...t, type: newType }
      }
      return t
    })

    // Try to keep position, otherwise find new spot
    const size = TILE_SIZES[newType as TileType] ?? TILE_SIZES['normal']
    const canStay = isPositionFree(updatedTiles.filter(t => t.id !== id), tile.x, tile.y, size)

    if (canStay && tile.x + size.w - 1 <= gridInfo.columns && tile.y + size.h - 1 <= gridInfo.rows) {
      setTiles(updatedTiles)
    } else {
      const position = FindNextTilePosition(updatedTiles.filter(t => t.id !== id), newType, gridInfo)
      const finalUpdated = UpdateTile(updatedTiles, id, { type: newType, x: position.x, y: position.y })
      setTiles(finalUpdated)
    }
    closeContextMenu()
  }

  const startMove = (tile: Tile) => {
    setDraggedTile(tile)
    setDragPos({ x: tile.x, y: tile.y })
    closeContextMenu()
  }

  const handleDragMove = (e: React.MouseEvent) => {
    if (!draggedTile) return
    const gridRect = e.currentTarget.getBoundingClientRect()
    const tileSize = TILE_SIZES[draggedTile.type as TileType] ?? TILE_SIZES['normal']
    const col = Math.max(1, Math.min(gridInfo.columns - tileSize.w + 1,
      Math.floor((e.clientX - gridRect.left) / (baseTileSize + gap)) + 1
    ))
    const row = Math.max(1, Math.min(gridInfo.rows - tileSize.h + 1,
      Math.floor((e.clientY - gridRect.top) / (baseTileSize + gap)) + 1
    ))
    setDragPos({ x: col, y: row })
  }

  const finishMove = () => {
    if (!draggedTile || !dragPos) return
    const size = TILE_SIZES[draggedTile.type as TileType] ?? TILE_SIZES['normal']
    const otherTiles = tiles.filter(t => t.id !== draggedTile.id)
    const canPlace = isPositionFree(otherTiles, dragPos.x, dragPos.y, size)
    if (canPlace) {
      const updated = UpdateTile(tiles, draggedTile.id, { x: dragPos.x, y: dragPos.y })
      setTiles(updated)
    }
    setDraggedTile(null)
    setDragPos(null)
  }

  const isPositionFree = (currentTiles: Tile[], x: number, y: number, size: { w: number, h: number }) => {
    for (const tile of currentTiles) {
      const tSize = TILE_SIZES[tile.type as TileType] ?? TILE_SIZES['normal']
      if (
        x < tile.x + tSize.w &&
        x + size.w > tile.x &&
        y < tile.y + tSize.h &&
        y + size.h > tile.y
      ) {
        return false
      }
    }
    return true
  }
  const openAddModal = () => {
    setNewTile({
      name: '',
      icon: '',
      url: '',
      colour: '#1BA1E2',
      type: 'normal'
    })
    setShowAddModal(true)
  }

  const openEditModal = (tile: Tile) => {
    setSelectedTile({ ...tile })
    setShowEditModal(true)
    closeContextMenu()
  }

  const saveEditedTile = () => {
    if (!selectedTile) return

    const isValidURL = validateURL(selectedTile.url)
    if (!isValidURL) {
      alert("Invalid URL, must start with http/https")
      return
    }

    if (selectedTile.icon && selectedTile.icon.startsWith('data:') && !validateCustomIcon(selectedTile.icon)) {
      alert("Invalid custom icon: must be a valid PNG, JPEG, WebP, or GIF data URL")
      return
    }

    const updatedTiles = UpdateTile(tiles, selectedTile.id, {
      name: selectedTile.name,
      url: selectedTile.url,
      colour: selectedTile.colour,
      icon: selectedTile.icon?.startsWith('data:') ? selectedTile.icon : IconMap[handleURL(selectedTile.url) as keyof typeof IconMap],
      type: selectedTile.type,
    })

    setTiles(updatedTiles)
    setShowEditModal(false)
    setSelectedTile(null)
  }
  const handleGridContextMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.tile')) return

    e.preventDefault()
    openAddModal()
  }

  return (
    <div className='w-screen h-screen shrink-0 p-4' onClick={closeContextMenu}>
      <div className='text-white pb-8 flex flex-row items-center justify-between'><h1 className='text-5xl inline-block ml-2'>Start</h1>
        <div className='w-1/3 flex justify-between text-3xl text-white'>
          <button className='inline-block cursor-pointer' title='Add tile' onClick={() => { openAddModal() }}>Add Tile</button>
          <button className='inline-block'>Scroll for settings</button>
        </div>
      </div>
      <div className='grid-wrapper flex justify-center'
        onMouseMove={handleDragMove}
        onMouseUp={finishMove}
        onMouseLeave={finishMove}
      >
        <div
          className='start-grid grid'
          style={{
            gridTemplateColumns:
              `repeat(${gridInfo.columns}, ${baseTileSize}px)`,
            gridTemplateRows:
              `repeat(${gridInfo.rows}, ${baseTileSize}px)`,
            gap: `${gap}px`
          }}
          onContextMenu={handleGridContextMenu}
        >
          {tiles.map(tile => {
            const size = TILE_SIZES[tile.type as TileType] ?? TILE_SIZES['normal']
            const isDragging = draggedTile?.id === tile.id
            return (
              <div
                key={tile.id}
                className="tile text-base"
                style={{
                  background: settings.transparency ? `${tile.colour}${ToHex(settings.opacity)}` : tile.colour,
                  gridColumn:
                    `${tile.x} / span ${size.w}`,
                  gridRow:
                    `${tile.y} / span ${size.h}`,
                  zIndex: isDragging ? 50 : 1,
                  backdropFilter: settings.transparency ? 'blur(8px)' : 'none'
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  openContextMenu(e, tile.id)
                }}
                onMouseDown={(_) => {
                  if (draggedTile) return
                }}
              >
                <a href={tile.url} target='_blank' rel="noopener noreferrer" className='h-full w-full' onClick={(e) => draggedTile && e.preventDefault()}>
                  <div className="tile-content w-full h-full flex flex-col justify-end items-start p-1" style={{
                    backgroundImage: tile.icon?.startsWith('data:') ? `url(${tile.icon})` : `url(https://cdn.simpleicons.org/${tile.icon}/ffffff)`,
                    backgroundPosition: 'center center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '30%'
                  }}>
                    <span className="tile-name">{tile.name}</span>
                  </div>
                </a>
              </div>
            )
          })}

          {/* Dragged preview */}
          {draggedTile && dragPos && (
            <div
              className="tile text-base pointer-events-none"
              style={{
                background: draggedTile.colour || "#1BA1E2",
                opacity: 0.85,
                gridColumn: `${dragPos.x} / span ${TILE_SIZES[draggedTile.type as TileType].w ?? TILE_SIZES['normal'].w}`,
                gridRow: `${dragPos.y} / span ${TILE_SIZES[draggedTile.type as TileType].h ?? TILE_SIZES['normal'].h}`,
                zIndex: 100,
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
                backdropFilter: settings.transparency ? 'blur(12px)' : 'none'
              }}
            >
              <div className="tile-content w-full h-full flex flex-col justify-end items-start p-1" style={{
                backgroundImage: draggedTile.icon?.startsWith('data:') ? `url(${draggedTile.icon})` : `url(https://cdn.simpleicons.org/${draggedTile.icon}/ffffff)`,
                backgroundPosition: 'center center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '30%'
              }}>
                <span className="tile-name">{draggedTile.name}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      {
        contextMenu && (
          <div className='fixed bg-[#141414] text-gray-100 shadow-md z-50'
            style={{ left: contextMenu.x + 10, top: contextMenu.y, width: `${3 * baseTileSize}px` }}
            onClick={e => e.stopPropagation()}>

            <div className="relative group">
              <button className="w-full text-gray-300 text-left px-4 py-2 hover:bg-[#333333] flex items-center justify-between">
                Resize <span className='text-xs'>&gt;</span>
              </button>
              <div className='hidden group-hover:block absolute left-full top-0 bg-[#141414] shadow-xl py-1 z-50' style={{ width: `${3 * baseTileSize}px` }}>
                <div className="px-4 py-2 text-zinc-400 text-xs">Choose size</div>
                {(['tiny', 'normal', 'wide', 'large'] as const).map(size => (
                  <button
                    key={size}
                    className="w-full text-left px-4 py-2 hover:bg-zinc-800 text-gray-300"
                    onClick={() => resizeTile(contextMenu.tileId, size)}
                  >
                    {size.charAt(0).toUpperCase() + size.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <button className="w-full px-4 py-2 hover:bg-[#333333] text-gray-300 text-left" onClick={() => {
              const tile = tiles.find(t => t.id === contextMenu.tileId)
              if (tile) openEditModal(tile)
            }}>Edit</button>
            <button className="w-full px-4 py-2 hover:bg-[#333333] text-gray-300 text-left" onClick={() => startMove(tiles.find(t => t.id === contextMenu.tileId)!)}>Move</button>
            <button className="w-full px-4 py-2 hover:bg-[#993333] text-red-400 text-left" onClick={() => deleteTile(contextMenu.tileId)}>Delete</button>
          </div>
        )
      }
      {showAddModal && <Modal heading={'Add Tile'} tile={newTile} setTile={setNewTile} doTile={addTile} setCustomIcon={setCustomIcon} setShowModal={setShowAddModal} />}
      {showEditModal && selectedTile && <Modal heading={'Edit Tile'} tile={selectedTile} setTile={setSelectedTile} doTile={saveEditedTile} setCustomIcon={setCustomIcon} setShowModal={setShowEditModal} />}
    </div >
  )
}

const Modal = ({ heading, tile, setTile, doTile, setCustomIcon, setShowModal }: { heading: string, tile: Partial<Tile>, setTile: any, doTile: () => void, setCustomIcon: (string: string) => void, setShowModal: (bool: boolean) => void }) => {
  if (!tile) {
    return null
  }
  return (
    <div className="modal-backdrop bg-[00000066] fixed flex items-center justify-center inset-0 z-51">
      <div className="modal w-1/2 bg-[#181818] p-4 flex flex-col gap-4 text-white">
        <h1 className='text-xl'>{heading}</h1>
        <input placeholder="Name" value={tile.name} required onChange={e =>
          setTile({
            ...tile,
            name: e.target.value
          })}
        />
        <input placeholder="URL" value={tile.url} required onChange={e =>
          setTile({
            ...tile,
            url: e.target.value
          })}
        />
        <input type="color" value={tile.colour} required onChange={e =>
          setTile({
            ...tile,
            colour: e.target.value
          })}
        />
        <input
          type="file"
          className='hidden'
          id='icon-upload'
          accept="image/*"
          onChange={e => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = (ev) => {
              const img = new Image()
              img.onload = () => {
                const MAX_SIZE = 100
                let { width, height } = img
                const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height)
                width = Math.round(width * ratio)
                height = Math.round(height * ratio)
                const canvas = document.createElement('canvas')
                canvas.width = MAX_SIZE
                canvas.height = MAX_SIZE
                const ctx = canvas.getContext('2d')!
                ctx.clearRect(0, 0, MAX_SIZE, MAX_SIZE)
                const x = Math.round((MAX_SIZE - width) / 2)
                const y = Math.round((MAX_SIZE - height) / 2)
                ctx.drawImage(img, x, y, width, height)
                const resizedBase64 = canvas.toDataURL('image/png', 1)
                setCustomIcon(resizedBase64)
                setTile((prev: Tile) => prev ? { ...prev, icon: resizedBase64 } : null)
              }
              img.src = ev.target?.result as string
            }
            reader.readAsDataURL(file)
          }}
        />
        <label htmlFor="icon-upload" className='metro-button-attention'>Upload Custom Icon (Optional)</label>
        <select value={tile.type} className='bg-[#252525] text-white p-2' required onChange={e =>
          setTile({
            ...tile,
            type: e.target.value
          })}
        >
          <option value="tiny">Tiny</option>
          <option value="normal">Normal</option>
          <option value="wide">Wide</option>
          <option value="large">Large</option>
        </select>
        <div className='flex gap-2'>
          <button onClick={doTile} className='metro-button-attention'>{heading === 'Add Tile' ? 'Create' : 'Save'}</button>
          <button onClick={() => {
            setShowModal(false)
            setTile({
              name: '',
              icon: '',
              url: '',
              colour: '#1BA1E2',
              type: 'normal'
            })
          }} className='metro-button-subdued'>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const FindNextTilePosition = (
  tiles: Tile[],
  type: TileType,
  gridInfo: GridInfo
) => {
  const size = TILE_SIZES[type] ?? TILE_SIZES['normal']
  for (let y = 1; y <= gridInfo.rows; y++) {
    for (let x = 1; x <= gridInfo.columns; x++) {
      let occupied = false
      for (const tile of tiles) {
        const tileSize = TILE_SIZES[tile.type as TileType] ?? TILE_SIZES['normal']
        const overlaps =
          x < tile.x + tileSize.w &&
          x + size.w > tile.x &&
          y < tile.y + tileSize.h &&
          y + size.h > tile.y
        if (overlaps) {
          occupied = true
          break
        }
      }
      const insideGrid =
        x + size.w - 1 <= gridInfo.columns &&
        y + size.h - 1 <= gridInfo.rows
      if (!occupied && insideGrid) {
        return { x, y }
      }
    }
  }
  return { x: 1, y: 1 }
}

const CreateTile = (tiles: Tile[], newTile: Tile): Tile[] => {
  const updatedTiles = [...tiles, newTile]
  SaveTiles(updatedTiles)
  return updatedTiles
}

const LoadTiles = (): Tile[] => {
  const storedTiles = localStorage.getItem(TILES_KEY)
  if (storedTiles) {
    return JSON.parse(storedTiles)
  }
  else {
    return tilesData.tiles
  }
}

const SaveTiles = (tiles: Tile[]) => {
  localStorage.setItem(
    TILES_KEY,
    JSON.stringify(tiles)
  )
}

const UpdateTile = (tiles: Tile[], id: string, updates: Partial<Tile>): Tile[] => {
  const updatedTiles = tiles.map(tile => {
    if (tile.id === id) {
      return { ...tile, ...updates }
    }
    return tile
  })
  SaveTiles(updatedTiles)
  return updatedTiles
}

const DeleteTile = (tiles: Tile[], id: string): Tile[] => {
  const updatedTiles = tiles.filter(tile => tile.id !== id)
  SaveTiles(updatedTiles)
  return updatedTiles
}

const SettingsSect = ({ settings, setSettings, setTiles }: { settings: Settings, setSettings: (settings: Settings) => void, setTiles: (tile: Tile[]) => void }) => {
  const importTiles = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      alert('Error: Please select a valid JSON file')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string)
        const isValidTile = parsed.every((tile: Tile) => tile.id && tile.name && tile.type && tile.x && tile.y)
        if (!isValidTile) {
          alert('Invalid format: Expected array of tiles')
          return
        }
        SaveTiles(parsed)
        setTiles(parsed)
        alert("Tiles imported successfully")
      } catch (err) {
        alert(`Invalid File`)
        console.error("Invalid File", err)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const exportTiles = () => {
    const savedTiles = localStorage.getItem(TILES_KEY)
    if (!savedTiles) {
      return
    }
    try {
      const blob = new Blob([savedTiles], { "type": "application/json" })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `tiles-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      alert(`Export failed`)
      console.error(`Export failed: ${err}`)

    }
  }

  const applyTheme = (theme: string) => {
    if (!window.confirm(`Apply ${theme} theme?`)) return
    let newSettings = { ...settings, theme: theme }
    if (theme === 'windows8') {
      newSettings = {
        ...newSettings,
        backgroundImage: `assets/windows8bg.png`,
        gap: 8,
        opacity: 255,
        transparency: false
      }
    } else if (theme === 'windows10') {
      newSettings = {
        ...newSettings,
        backgroundImage: `assets/windows10bg.png`,
        gap: 4,
        opacity: 51,
        transparency: true
      }
    } else {
      newSettings = {
        ...newSettings,
        backgroundImage: ``,
        gap: 8,
        opacity: 255,
        transparency: false
      }
    }
    setSettings(newSettings)
  }

  const validateBgImage = (bgImage: string) => {
    if (!bgImage) {
      return ''
    }
    try {
      const parsed = new URL(bgImage)
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return bgImage
      }
      return ''
    } catch {
      if (/^assets\/[a-zA-Z0-9._-]+$/.test(bgImage)) {
        return bgImage
      }
      return ''
    }
  }

  const confirmSettings = (newSettings: Settings) => {
    if (window.confirm('Apply these settings?')) {
      setSettings(newSettings)
    }
  }
  return (
    <div className='w-screen h-screen shrink-0 p-4 overflow-scroll'>
      <div className='text-white pb-8 flex flex-row items-center justify-between'>
        <h1 className='text-5xl inline-block ml-2'>Settings</h1>
        <div className='w-1/3 flex justify-between text-3xl text-white'>
          <button className='inline-block cursor-pointer' title='Save Settings' onClick={() => { confirmSettings({ ...settings }) }}>Save Settings</button>
          <span className='text-white text-3xl'>Scroll left for start</span>
        </div>

      </div>
      <div className='settings-group'>
        <p>Tile Gap</p>
        <div className='flex items-center gap-4'>
          <input
            className='metro-slider appearance-none w-1/4 bg-[#505050] h-2' type="range"
            min={0}
            max={16}
            step={4}
            value={settings.gap}
            onChange={e =>
              setSettings({
                ...settings,
                gap: Number(e.target.value)
              })
            }
          />
          <span className='text-xl tracking-wide'>{settings.gap}px</span>
        </div>
      </div>
      <div className='settings-group'>
        <p className='flex items-center gap-4'>
          <input type="checkbox" className='metro-checkbox' checked={settings.transparency}
            onChange={e =>
              setSettings({
                ...settings,
                transparency: e.target.checked
              })
            }
          />
          Transparency Effects
        </p>
      </div>
      <div className='settings-group'>
        <p>Opacity</p>
        <div className='flex items-center gap-4'>
          <input
            className='metro-slider appearance-none w-1/4 bg-[#505050] h-2' type="range"
            min={0}
            max={255}
            step={51}
            value={settings.opacity}
            onChange={e =>
              setSettings({
                ...settings,
                opacity: Number(e.target.value)
              })
            }
          />
          <span>{Number(settings.opacity) / 51}</span>
        </div>
      </div>
      <div className='settings-group'>
        <p>Padding</p>
        <div className='flex items-center gap-4'>
          <span>Horizontal</span>
          <input
            className='metro-slider appearance-none w-1/4 bg-[#505050] h-2' type="range"
            min={0}
            max={400}
            step={40}
            value={settings.horizontalPadding}
            onChange={e =>
              setSettings({
                ...settings,
                horizontalPadding: Number(e.target.value)
              })
            }
          />
          <span>{settings.horizontalPadding / 40}</span>
        </div>
        <div className='flex items-center gap-4'>
          <span>Vertical</span>
          <input
            className='metro-slider appearance-none w-1/4 bg-[#505050] h-2' type="range"
            min={0}
            max={400}
            step={40}
            value={settings.verticalPadding}
            onChange={e =>
              setSettings({
                ...settings,
                verticalPadding: Number(e.target.value)
              })
            }
          />
          <span>{settings.verticalPadding / 40}</span>
        </div>
      </div>
      <div className='settings-group'>
        <p>Background Image URL</p>
        <input type="text" className='bg-[#00000066] border-2 border-[#252525] focus:border-white hover:border-white p-2 outline-none'
          value={settings.backgroundImage}
          onChange={e =>
            setSettings({
              ...settings,
              backgroundImage: validateBgImage(e.target.value)
            })
          }
        />
      </div>
      <div className='settings-group'>
        <p>Theme</p>
        <select
          className='bg-[#00000066] border-2 border-transparent focus:border-white hover:border-white p-2 outline-none'
          value={settings.theme}
          onChange={e => {
            applyTheme(e.target.value)
          }}
        >
          <option value="default">Default</option>
          <option value="windows8">Windows 8</option>
          <option value="windows10">Windows 10</option>
        </select>
      </div>
      <div className='settings-group'>
        <p>Import/Export Tiles</p>
        <div className='w-20 gap-4 flex'>
          <label className="metro-button-attention">
            Import
            <input
              type="file"
              accept=".json,application/json"
              onChange={importTiles}
              className="hidden"
            />
          </label>
          <button className='metro-button-attention' onClick={() => exportTiles()}>Export</button>
        </div>
      </div>
    </div>
  )
}

const LoadSettings = (): Settings => {
  const stored = localStorage.getItem(SETTINGS_KEY)
  if (stored) {
    return JSON.parse(stored)
  }
  return DEFAULT_SETTINGS
}

const SaveSettings = (settings: Settings) => {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify(settings)
  )
}

const App = () => {
  const [tiles, setTiles] = useState<Tile[]>(LoadTiles())
  const [settings, setSettings] = useState<Settings>(LoadSettings())
  useEffect(() => {
    SaveSettings(settings)
  }, [settings])
  useEffect(() => {
    SaveTiles(tiles)
  }, [tiles])
  return (
    <>
      <div className='banner' id='banner'>
        <p>Metro Start is a browser startpage intended for large screen devices (desktops, laptops, tablets). For the best experience, open this page on your desktop, laptop or tablet.</p>
        <button className='metro-button-attention' onClick={() => document.getElementById('banner').style.display = 'none'}>Close</button>
      </div>
      <div className="horizontal-slider flex overflow-hidden transition-transform duration-300" style={{
        backgroundImage: settings.backgroundImage
          ? `linear-gradient(rgba(0, 0, 0, 0.25), rgba(0, 0, 0, 0.25)), url(${settings.backgroundImage})`
          : undefined,
        backgroundSize: 'cover, cover',
        backgroundPosition: 'center, center',
        backgroundAttachment: 'fixed',
      }}>
        <GridSect settings={settings} tiles={tiles} setTiles={setTiles} />
        <SettingsSect settings={settings} setSettings={setSettings} setTiles={setTiles} />
      </div>
    </>
  )
}

export default App