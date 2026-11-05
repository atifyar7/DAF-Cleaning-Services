const paths = {
  user: "M12 12a4.500 4.500 0 1 0 0-9 4.500 4.500 0 0 0 0 9zm-8 9c0-4 3.600-6.500 8-6.500s8 2.500 8 6.500",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
  home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  grid: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 10c0-3.300 3.100-5.500 7-5.500s7 2.200 7 5.500M16 3.500a4 4 0 0 1 0 7.500M18 15c2.400.6 4 2.600 4 5",
  inbox: "M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm0 0h5l1 3h6l1-3h5",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2l-4-4",
  shield: "M12 3l8 3v6c0 4.500-3.400 8.200-8 9-4.600-.8-8-4.500-8-9V6z",
  alert: "M12 4l9 16H3zm0 6v4m0 3h.01",
  note: "M5 4h14a1 1 0 0 1 1 1v10l-5 5H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm10 16v-5h5M8 9h8M8 13h5",
  card: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm-1 4h20M6 15h4",
  arrow: "M5 12h14M13 6l6 6-6 6",
  check: "M5 13l4 4L19 7",
  chevron: "M6 9l6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6L6 18",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm0 1l8 6 8-6",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.800-7 11-7 11zm0-8.500a2.500 2.500 0 1 0 0-5 2.500 2.500 0 0 0 0 5z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm0-13v4.500l3 2",
  calendar: "M4 6h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm-1 5h18M8 3v4m8-4v4",
  sparkle: "M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z",
  layers: "M12 3l9 5-9 5-9-5zm-9 9l9 5 9-5m-18 4l9 5 9-5",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM8 8h.01",
  document: "M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm8 0v5h5M8 13h8M8 17h6",
  whatsapp:
    "M12 3a9 9 0 0 0-7.700 13.600L3 21l4.500-1.200A9 9 0 1 0 12 3zm-3 5c.3 0 .6 0 .8.500l.8 1.800c.1.300 0 .5-.1.700l-.7.900c.8 1.400 1.900 2.400 3.400 3.100l.9-1c.2-.2.500-.3.700-.2l1.800.8c.4.200.4.500.4.800-.2 1.300-1.300 2.100-2.500 2-3.900-.4-7-3.500-7.200-7 0-1.200.7-2.300 1.700-2.400z",
};

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
