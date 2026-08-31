declare module "gi://GIRepository" {
    import GIRepository20 from "gi://GIRepository?version=2.0"
    import GIRepository30 from "gi://GIRepository?version=3.0"
    const GIRepository: typeof GIRepository20 | typeof GIRepository30
    export default GIRepository
}
