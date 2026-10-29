<script setup lang="ts">
import type { GardenId } from '../data/demoGardens'

defineProps<{ garden: GardenId }>()
</script>

<template>
  <svg viewBox="0 0 280 184" fill="none" aria-hidden="true" focusable="false" class="landing-garden-scene">
    <template v-if="garden === 'meadow'">
      <path fill="#dce2c6" d="M0 0h280v184H0z" />
      <circle cx="211" cy="41" r="21" fill="#fff0c5" />
      <path d="M0 103C75 46 152 110 280 74v110H0Z" fill="#a8bb8b" />
      <path d="M0 128c83-49 170-39 280 13v43H0Z" fill="#73966e" />
      <path d="M0 168c84-48 170-44 280-17v33H0Z" fill="#416f53" />
      <path d="M102 184c7-40 77-46 82-74 2-9-7-16-20-23 36 13 39 23 24 39-19 23-56 31-54 58" fill="#d8ce9e" />
      <g v-for="(flower, index) in [[33, 134], [56, 158], [80, 125], [217, 146], [243, 168], [257, 117]]" :key="index" :transform="`translate(${flower[0]} ${flower[1]})`">
        <path d="m0 12-1-24M0 7l-6-6M0 2l6-8" stroke="#a8bb8b" stroke-width="2" stroke-linecap="round" />
        <path d="M-6 4q-9-7-8 0 3 7 14 8M5 0q10-9 10-1-1 7-15 13" fill="#8fa477" />
        <g fill="#f8ebcc"><circle cy="-15" r="4" /><circle cx="-4" cy="-11" r="4" /><circle cx="4" cy="-11" r="4" /></g>
        <circle cy="-11" r="2" fill="#d9ae69" />
      </g>
    </template>
    <template v-else-if="garden === 'lake'">
      <path fill="#cfdfd6" d="M0 0h280v184H0z" />
      <circle cx="70" cy="39" r="19" fill="#fff0c5" />
      <path d="M0 93c59-38 133-44 280-11v102H0Z" fill="#8cab98" />
      <path d="M0 119c50-29 121-11 162-25 43-15 81 2 118 22v68H0Z" fill="#456f61" />
      <path d="M29 149c-23-18 24-40 69-35 52 6 84-19 121-12 49 9 48 53 17 68-42 20-175 3-207-21Z" fill="#8ea990" />
      <path d="M42 149c-21-11 19-31 62-26 49 5 80-18 112-11 39 8 40 35 15 47-39 18-163 3-189-10Z" fill="#548d8d" />
      <path d="M73 139q29 4 53 0m22 13q30 4 59-1m-69-24q29 2 44-1" stroke="#b3cec0" stroke-opacity=".6" stroke-width="2" stroke-linecap="round" />
      <path d="M174 142c-15-9-20 6-9 9 15 5 24-2 14-8l-6 3Z" fill="#a6b681" />
      <path d="m174 144-5-6 5-7 5 7Z" fill="#f3e1c4" />
      <g stroke="#b1bf91" stroke-width="2" stroke-linecap="round"><path d="M28 173q-2-29-10-38m10 38q1-29 10-37m-5 40q9-22 17-26M245 182q1-24 10-37m-10 37q-6-26-13-32" /></g>
      <path d="M0 170q38-9 73 14H0" fill="#315d50" />
    </template>
    <template v-else-if="garden === 'grove'">
      <path fill="#b3c6ad" d="M0 0h280v184H0z" />
      <path d="M0 88c89-35 147-39 280-4v100H0Z" fill="#7f9e7d" />
      <path d="M0 130c82-27 183 8 280-20v74H0Z" fill="#547e60" />
      <path d="M112 184c-25-32 23-46 45-69 12-13 6-23-12-31 39 6 43 21 27 40-23 24-37 40-22 60" fill="#a9b28a" />
      <g v-for="(tree, index) in [[31, 46], [86, 13], [235, 39]]" :key="index" :transform="`translate(${tree[0]} ${tree[1]})`">
        <path d="m0 87 2-65 6 2 1 63Z" fill="#a0a689" />
        <path d="m5 66-12-19m13 7 14-18" stroke="#9ba187" stroke-width="4" />
        <ellipse cx="4" cy="24" rx="37" ry="41" fill="#3d6b51" />
        <ellipse cx="-8" cy="9" rx="27" ry="28" fill="#547e5d" />
        <path d="M-22 5q16-21 37-6M-16 24q13-10 25-4" stroke="#8ba57c" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" />
      </g>
      <path d="M192 72v40m-4-43q4-5 8 0" stroke="#72865f" stroke-width="2" />
      <circle cx="192" cy="121" r="20" fill="#efc77c" fill-opacity=".1" />
      <rect x="187" y="111" width="10" height="20" rx="3" fill="#ded5aa" />
      <rect x="190" y="115" width="4" height="11" rx="2" fill="#ffe1a2" />
      <path d="M22 174q13-22 25-7 18-17 28 7M199 174q15-23 28-9 19-16 33 11" fill="#3d6b51" />
      <path d="m105 147 5-2-1 6-5 2Zm73 13 5 1-4 5-5-1Z" fill="#d2be82" />
    </template>
    <template v-else>
      <path fill="#dce0ca" d="M0 0h280v184H0z" />
      <circle cx="214" cy="40" r="20" fill="#fff0c5" />
      <path d="M0 106 86 41q14-11 28 2l97 77v64H0Z" fill="#a4b58c" />
      <path d="m69 64 17-23q14-11 28 2l26 21-28-5-13 4-11-7Z" fill="#c9d2af" />
      <path d="M280 68C170 54 148 128 0 138v46h280Z" fill="#789971" />
      <path d="M0 163c107-44 172-24 280-45v66H0Z" fill="#4e7c5e" />
      <path d="M209 82c-71 26-34 43-59 55-24 12-57 16-43 47h17c-21-25 21-29 37-43 22-18-15-34 48-59" fill="#85b8ae" />
      <path d="m47 128 9-16 17 4 6 15-21 4Zm162 39 7-13 19-2 11 18-24 5Z" fill="#81917c" />
      <path d="m47 128 9-16 17 4-14 12Zm162 39 7-13 19-2-14 16Z" fill="#b5bca1" />
      <g stroke="#adbf8f" stroke-width="2" stroke-linecap="round"><path d="M34 172q3-20 11-24m-11 24q-9-17-14-16m16 18q6-12 13-14M251 132q2-21 9-28m-10 28q-5-15-13-21" /></g>
      <path d="M6 115q10-14 23-7 15-12 23 1M173 174q8-18 20-10 9-9 17 0" fill="#3d6c50" />
    </template>
  </svg>
</template>
