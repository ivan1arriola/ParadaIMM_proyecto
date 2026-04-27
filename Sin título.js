function myFunction() {
  const lineVariants = getLineVariants();
  if (lineVariants) {
    Logger.log(lineVariants);
  } else {
    Logger.log("No se pudieron obtener las variantes de línea.");
  }
}