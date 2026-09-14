// Only the Home route exists today, so breadcrumbs never have more than one
// segment - this always renders nothing. Kept as a no-op so Layout doesn't
// need special-casing if more routes are added later.
function DynamicBreadcrumb() {
  return null
}

export default DynamicBreadcrumb
