<script setup lang="ts">
defineProps<{
    name:
        | 'agent'
        | 'router'
        | 'parallel'
        | 'whileLoop'
        | 'subflow'
        | 'output'
        | 'start'
        | 'general'
        | 'instructions'
        | 'structured'
        | 'model'
        | 'tools'
        | 'routes'
        | 'failure'
        | 'human'
        | 'advanced'
        | 'back'
        | 'chevron'
        | 'more'
        | 'close';
}>();
</script>

<template>
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <template v-if="name === 'agent'">
            <rect x="4" y="9" width="16" height="11" rx="2" />
            <path d="M12 5v4M9 5h6M8 13h.01M16 13h.01M9 17h6" />
        </template>
        <template v-else-if="name === 'router' || name === 'routes'">
            <circle cx="6" cy="5" r="2" />
            <circle cx="18" cy="7" r="2" />
            <circle cx="18" cy="18" r="2" />
            <path d="M6 7v7a4 4 0 0 0 4 4h6M8 6h4a4 4 0 0 1 4 4v6" />
        </template>
        <template v-else-if="name === 'parallel'">
            <circle cx="6" cy="5" r="2" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="18" cy="18" r="2" />
            <path d="M6 7v9a2 2 0 0 0 2 2h8M8 6h8" />
        </template>
        <template v-else-if="name === 'whileLoop'">
            <path d="M4 12a8 8 0 0 1 13.6-5.7L20 9M20 4v5h-5" />
            <path d="M20 12a8 8 0 0 1-13.6 5.7L4 15M4 20v-5h5" />
        </template>
        <template v-else-if="name === 'subflow'">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="8.5" y="14" width="7" height="7" rx="1" />
            <path d="M6.5 10v2a2 2 0 0 0 2 2h1M17.5 10v2a2 2 0 0 1-2 2h-1" />
        </template>
        <template v-else-if="name === 'output'">
            <path d="M4 5h16v11H8l-4 4V5Z" />
            <path d="M8 9h8M8 12h5" />
        </template>
        <template v-else-if="name === 'start'">
            <path d="m8 5 11 7-11 7V5Z" />
        </template>
        <template v-else-if="name === 'general'">
            <path d="M6 3h9l3 3v15H6V3Z" />
            <path d="M14 3v4h4M9 12h6M9 16h6" />
        </template>
        <template v-else-if="name === 'instructions'">
            <path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h7" />
        </template>
        <template v-else-if="name === 'structured'">
            <path d="M8 5H5v14h3M16 5h3v14h-3" />
            <path d="M10 8h4M10 12h4M10 16h4" />
        </template>
        <template v-else-if="name === 'model'">
            <rect x="6" y="6" width="12" height="12" rx="2" />
            <path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M1 15h5M18 9h5M18 15h5M10 10h4v4h-4z" />
        </template>
        <template v-else-if="name === 'tools'">
            <path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5l-3 3-3-3 3-3Z" />
        </template>
        <template v-else-if="name === 'failure'">
            <path d="M12 3 2.8 20h18.4L12 3Z" />
            <path d="M12 9v5M12 17h.01" />
        </template>
        <template v-else-if="name === 'human'">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
        </template>
        <template v-else-if="name === 'advanced'">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </template>
        <template v-else-if="name === 'back'">
            <path d="m15 18-6-6 6-6" />
        </template>
        <template v-else-if="name === 'chevron'">
            <path d="m9 18 6-6-6-6" />
        </template>
        <template v-else-if="name === 'more'">
            <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
            <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </template>
        <template v-else-if="name === 'close'">
            <path d="M6 6l12 12M18 6 6 18" />
        </template>
    </svg>
</template>
