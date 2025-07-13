/**
 * Base interface for all input commands.
 * The `name` property is used to identify the command type.
 */
export interface CmdInput {
    name: string;
}

/**
 * An example command.
 */
export interface CmdDoSomething extends CmdInput {
    name: 'CmdDoSomething';
    payload: string;
} 