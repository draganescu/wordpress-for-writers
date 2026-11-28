<?php
/**
 * `wp writer` (spec/agent/surface.md): the abilities of includes/abilities.php
 * from the command line. Loaded only under WP-CLI.
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads a writer's notes and suggests changes to them, as an agent does.
 *
 * Every subcommand but `guide` prints one JSON document. The user an agent
 * works as is given with --user.
 */
class WFW_Writer_Command {

    /**
     * Prints the guide for agents, with the style sheet of the user given by --user.
     *
     * ## EXAMPLES
     *
     *     wp writer guide --user=anna
     */
    public function guide() {
        wfw_agent_touch();
        $style = wfw_get_style_sheet();
        WP_CLI::line( wfw_agent_guide() . ( '' === $style ? '' : "\n\n# The writer's style sheet\n\n" . $style ) );
    }

    /**
     * Prints the abilities, each with its name, its description and the schema of its input.
     *
     * ## EXAMPLES
     *
     *     wp writer abilities
     */
    public function abilities() {
        wfw_agent_touch();
        $abilities = array();
        foreach ( wp_get_abilities() as $ability ) {
            if ( 'writer' === $ability->get_category() ) {
                $abilities[] = array(
                    'name'        => $ability->get_name(),
                    'description' => $ability->get_description(),
                    'input'       => (object) $ability->get_input_schema(),
                );
            }
        }
        $this->output( $abilities );
    }

    /**
     * Runs one ability as the user given by --user.
     *
     * Prints { "ok": true, "result": … }, or { "ok": false, "error": { "code", "message" } }
     * and exits with 1.
     *
     * ## OPTIONS
     *
     * <name>
     * : The ability, with or without the leading writer/.
     *
     * [--input=<json>]
     * : Its input, as JSON.
     *
     * ## EXAMPLES
     *
     *     wp writer call note-get --input='{"note":214}' --user=anna
     *
     * @param string[] $args       The ability's name.
     * @param array    $assoc_args `input`.
     */
    public function call( $args, $assoc_args ) {
        wfw_agent_touch();
        $name  = 0 === strpos( $args[0], 'writer/' ) ? $args[0] : 'writer/' . $args[0];
        $input = isset( $assoc_args['input'] ) ? json_decode( $assoc_args['input'], true ) : null;
        if ( isset( $assoc_args['input'] ) && JSON_ERROR_NONE !== json_last_error() ) {
            $result = wfw_agent_error( 'invalid_args', __( 'input is not JSON.', 'wordpress-for-writers' ) );
        } elseif ( ! wp_has_ability( $name ) ) {
            /* translators: %s: the name of an ability, such as writer/note-get. */
            $result = wfw_agent_error( 'not_found', sprintf( __( 'Ability %s was not found.', 'wordpress-for-writers' ), $name ) );
        } else {
            $result = wp_get_ability( $name )->execute( $input );
        }
        if ( is_wp_error( $result ) ) {
            $this->output( array(
                'ok'    => false,
                'error' => array(
                    'code'    => $result->get_error_code(),
                    'message' => $result->get_error_message(),
                ),
            ) );
            WP_CLI::halt( 1 );
        }
        $this->output( array(
            'ok'     => true,
            'result' => $result,
        ) );
    }

    /**
     * Prints one JSON document, its text as it is: an agent quotes from it.
     *
     * @param mixed $document What to print.
     */
    private function output( $document ) {
        WP_CLI::line( wp_json_encode( $document, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) );
    }
}

WP_CLI::add_command( 'writer', 'WFW_Writer_Command' );
